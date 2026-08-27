import { randomUUID, createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

export type MediaKind = "DOCUMENT" | "IMAGE";
export type MediaVisibility = "PUBLIC" | "PRIVATE";

export interface MediaObjectStore {
  put(
    key: string,
    bytes: Uint8Array,
    options: { readonly contentType: string }
  ): Promise<void>;
  /** Removes a key written during a failed higher-level transaction. */
  remove(key: string): Promise<void>;
}

export interface S3MediaObjectStoreConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle?: boolean;
}

export interface MediaIngestionInput {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly kind: MediaKind;
  readonly visibility: MediaVisibility;
  readonly maxBytes: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxPdfPages?: number;
}

export interface VerifiedMedia {
  /** UUID accepted by the shared opaque-ID contract and persisted in MediaAsset. */
  readonly id: string;
  /** Random, private object key; never derive a public URL from this value. */
  readonly storageKey: string;
  readonly displayName: string;
  readonly kind: MediaKind;
  readonly mimeType:
    "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  readonly byteSize: bigint;
  readonly checksumSha256: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly visibility: MediaVisibility;
  readonly processingState: "VERIFIED";
}

export interface QuarantinedMedia {
  readonly id: string;
  readonly storageKey: string;
  readonly displayName: string;
  readonly kind: MediaKind;
  readonly mimeType: string;
  readonly byteSize: bigint;
  readonly checksumSha256: string;
  readonly width: null;
  readonly height: null;
  readonly visibility: MediaVisibility;
  readonly processingState: "QUARANTINED";
  readonly rejectionReason: string;
}

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
} as const;

type VerifiedMime = VerifiedMedia["mimeType"];

/**
 * Verifies bytes before storage. Client-supplied MIME and filename extensions
 * never decide the type; only magic-byte detection does.
 */
export async function ingestMedia(
  input: MediaIngestionInput,
  store: MediaObjectStore
): Promise<VerifiedMedia> {
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) {
    throw new MediaValidationError("maxBytes must be a positive safe integer.");
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > input.maxBytes) {
    throw new MediaValidationError(
      "Media byte size must be between 1 and the configured maximum."
    );
  }

  const bytes = Buffer.from(input.bytes);
  const detected = await fileTypeFromBuffer(bytes);
  const mimeType = detected?.mime as VerifiedMime | undefined;

  try {
    if (mimeType === undefined || !isAllowedMime(mimeType)) {
      throw new MediaValidationError("Unsupported or unrecognized media type.");
    }
    if (kindForMime(mimeType) !== input.kind) {
      throw new MediaValidationError(
        "Detected media type does not match the requested media kind."
      );
    }

    const transformed =
      mimeType === "application/pdf"
        ? verifyPdf(bytes, input.maxPdfPages ?? 100)
        : await reencodeImage(
            bytes,
            mimeType,
            input.maxWidth ?? 8_192,
            input.maxHeight ?? 8_192
          );
    const id = randomUUID();
    const extension = extensionForMime(mimeType);
    const storageKey = "media/" + id + "." + extension;
    const verified: VerifiedMedia = {
      id,
      storageKey,
      displayName: safeDisplayName(input.filename, extension),
      kind: input.kind,
      mimeType,
      byteSize: BigInt(transformed.bytes.byteLength),
      checksumSha256: createHash("sha256")
        .update(transformed.bytes)
        .digest("hex"),
      width: transformed.width,
      height: transformed.height,
      visibility: input.visibility,
      processingState: "VERIFIED",
    };

    await store.put(storageKey, transformed.bytes, { contentType: mimeType });
    return verified;
  } catch (error) {
    if (!(error instanceof MediaValidationError)) throw error;
    const id = randomUUID();
    const extension =
      mimeType !== undefined && isAllowedMime(mimeType)
        ? extensionForMime(mimeType)
        : "bin";
    const storageKey = `quarantine/${id}.${extension}`;
    const quarantined: QuarantinedMedia = {
      id,
      storageKey,
      displayName: safeDisplayName(input.filename, extension),
      kind: input.kind,
      mimeType: mimeType ?? "application/octet-stream",
      byteSize: BigInt(bytes.byteLength),
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      width: null,
      height: null,
      visibility: "PRIVATE",
      processingState: "QUARANTINED",
      rejectionReason: error.message,
    };
    await store.put(storageKey, bytes, {
      contentType: "application/octet-stream",
    });
    throw new MediaQuarantinedError(error.message, quarantined);
  }
}

/**
 * Local/test implementation. It receives only already-verified bytes and
 * rejects traversal even if an upstream caller is compromised.
 */
export class LocalMediaObjectStore implements MediaObjectStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = path.resolve(root);
  }

  async put(
    key: string,
    bytes: Uint8Array,
    _options: { readonly contentType: string }
  ): Promise<void> {
    const target = safeObjectPath(this.#root, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
  }

  async remove(key: string): Promise<void> {
    await rm(safeObjectPath(this.#root, key), { force: true });
  }
}

/** Private-bucket MinIO/S3 adapter; credentials stay in the API process. */
export class S3MediaObjectStore implements MediaObjectStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string
  ) {
    if (!bucket.trim())
      throw new MediaValidationError("S3 bucket is required.");
  }

  async put(
    key: string,
    bytes: Uint8Array,
    options: { readonly contentType: string }
  ): Promise<void> {
    assertObjectKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: options.contentType,
      })
    );
  }

  async remove(key: string): Promise<void> {
    assertObjectKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }
}

/** Creates the private S3-compatible adapter used with MinIO in deployment. */
export function createS3MediaObjectStore(
  config: S3MediaObjectStoreConfig
): S3MediaObjectStore {
  if (!config.endpoint.trim()) {
    throw new MediaValidationError("S3 endpoint is required.");
  }
  if (!config.region.trim()) {
    throw new MediaValidationError("S3 region is required.");
  }
  if (!config.accessKeyId.trim() || !config.secretAccessKey.trim()) {
    throw new MediaValidationError("S3 credentials are required.");
  }
  try {
    new URL(config.endpoint);
  } catch {
    throw new MediaValidationError("S3 endpoint must be an absolute URL.");
  }
  return new S3MediaObjectStore(
    new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
    config.bucket
  );
}

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export class MediaQuarantinedError extends MediaValidationError {
  constructor(
    message: string,
    public readonly media: QuarantinedMedia
  ) {
    super(message);
    this.name = "MediaQuarantinedError";
  }
}

export function safeDisplayName(
  filename: string,
  requiredExtension: string
): string {
  const basename = path
    .basename(filename.normalize("NFC"))
    .replace(/[^\p{L}\p{N}._ -]/gu, "-");
  const stem = basename
    .replace(/\.[^.]*$/u, "")
    .replace(/[.\s-]+$/u, "")
    .slice(0, 120);
  return (stem || "upload") + "." + requiredExtension;
}

function safeObjectPath(root: string, key: string): string {
  assertObjectKey(key);
  const target = path.resolve(root, key);
  if (!target.startsWith(root + path.sep)) {
    throw new MediaValidationError("Storage key escapes the configured root.");
  }
  return target;
}

function assertObjectKey(key: string): void {
  if (
    !/^(?:media|quarantine)\/[0-9a-f-]{36}\.(?:pdf|jpg|png|webp|bin)$/i.test(
      key
    )
  ) {
    throw new MediaValidationError(
      "Storage key is not an application media key."
    );
  }
}

function verifyPdf(
  bytes: Buffer,
  maxPages: number
): { readonly bytes: Buffer; readonly width: null; readonly height: null } {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 1_000) {
    throw new MediaValidationError("PDF page limit is invalid.");
  }
  const source = bytes.toString("latin1");
  if (!/^%PDF-1\.[0-7]/.test(source) || !/%%EOF[\s\0]*$/.test(source)) {
    throw new MediaValidationError("PDF structure is incomplete or malformed.");
  }
  if (
    /\/(?:JavaScript|JS|Launch|EmbeddedFile|XFA|RichMedia|OpenAction|AA)\b/i.test(
      source
    )
  ) {
    throw new MediaValidationError("Active or embedded PDF content is not allowed.");
  }
  const pages = source.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  if (pages < 1 || pages > maxPages) {
    throw new MediaValidationError(
      `PDF page count must be between 1 and ${maxPages}.`
    );
  }
  return { bytes, width: null, height: null };
}

async function reencodeImage(
  bytes: Buffer,
  mimeType: Exclude<VerifiedMime, "application/pdf">,
  maxWidth: number,
  maxHeight: number
): Promise<{ readonly bytes: Buffer; readonly width: number; readonly height: number }> {
  if (
    !Number.isSafeInteger(maxWidth) ||
    !Number.isSafeInteger(maxHeight) ||
    maxWidth < 1 ||
    maxHeight < 1
  ) {
    throw new MediaValidationError("Image dimension limits are invalid.");
  }
  try {
    const source = sharp(bytes, {
      failOn: "error",
      limitInputPixels: maxWidth * maxHeight,
    });
    const metadata = await source.metadata();
    if (
      metadata.width === undefined ||
      metadata.height === undefined ||
      metadata.width > maxWidth ||
      metadata.height > maxHeight
    ) {
      throw new MediaValidationError(
        `Image dimensions must not exceed ${maxWidth} by ${maxHeight}.`
      );
    }
    const pipeline = source.rotate();
    const output =
      mimeType === "image/jpeg"
        ? pipeline.jpeg({ quality: 88, mozjpeg: true })
        : mimeType === "image/png"
          ? pipeline.png({ compressionLevel: 9, palette: false })
          : pipeline.webp({ quality: 88 });
    return {
      bytes: await output.toBuffer(),
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    if (error instanceof MediaValidationError) throw error;
    throw new MediaValidationError("Image decoding or re-encoding failed.");
  }
}

function isAllowedMime(value: string): value is VerifiedMime {
  return Object.values(MIME_BY_EXTENSION).includes(value as VerifiedMime);
}

function kindForMime(mime: VerifiedMime): MediaKind {
  return mime === "application/pdf" ? "DOCUMENT" : "IMAGE";
}

function extensionForMime(mime: VerifiedMime): keyof typeof MIME_BY_EXTENSION {
  for (const [extension, value] of Object.entries(MIME_BY_EXTENSION)) {
    if (value === mime) return extension as keyof typeof MIME_BY_EXTENSION;
  }
  throw new MediaValidationError(
    "No file extension exists for the verified MIME type."
  );
}
