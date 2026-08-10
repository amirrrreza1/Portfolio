import { randomUUID, createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";

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
  readonly visibility: MediaVisibility;
  readonly processingState: "VERIFIED";
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
  if (mimeType === undefined || !isAllowedMime(mimeType)) {
    throw new MediaValidationError("Unsupported or unrecognized media type.");
  }
  if (kindForMime(mimeType) !== input.kind) {
    throw new MediaValidationError(
      "Detected media type does not match the requested media kind."
    );
  }

  const id = randomUUID();
  const extension = extensionForMime(mimeType);
  const storageKey = "media/" + id + "." + extension;
  const verified: VerifiedMedia = {
    id,
    storageKey,
    displayName: safeDisplayName(input.filename, extension),
    kind: input.kind,
    mimeType,
    byteSize: BigInt(bytes.byteLength),
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    visibility: input.visibility,
    processingState: "VERIFIED",
  };

  await store.put(storageKey, bytes, { contentType: mimeType });
  return verified;
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
  if (!/^media\/[0-9a-f-]{36}\.(?:pdf|jpg|png|webp)$/i.test(key)) {
    throw new MediaValidationError(
      "Storage key is not an application media key."
    );
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
