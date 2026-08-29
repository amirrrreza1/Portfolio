import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import { describe, expect, it } from "vitest";

import {
  ingestMedia,
  LocalMediaObjectStore,
  MediaValidationError,
  MediaQuarantinedError,
  quarantineArticleSource,
  safeDisplayName,
} from "../src/index.js";

const PDF = Buffer.from(
  "%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF\n",
  "utf8"
);
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex"
);

describe("verified media ingestion", () => {
  it("hashes detected PDF bytes and writes only below the local media root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "portfolio-media-"));
    try {
      const result = await ingestMedia(
        {
          bytes: PDF,
          filename: "../../resume?.pdf",
          kind: "DOCUMENT",
          visibility: "PRIVATE",
          maxBytes: 1024,
        },
        new LocalMediaObjectStore(root)
      );

      expect(result.mimeType).toBe("application/pdf");
      expect(result.displayName).toBe("resume.pdf");
      expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
      await expect(
        readFile(path.join(root, result.storageKey))
      ).resolves.toEqual(PDF);
      await new LocalMediaObjectStore(root).remove(result.storageKey);
      await expect(
        readFile(path.join(root, result.storageKey))
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a MIME/kind mismatch, unknown bytes, and exhausted size budget", async () => {
    const store = { put: async () => undefined, remove: async () => undefined };

    await expect(
      ingestMedia(
        {
          bytes: PNG,
          filename: "image.png",
          kind: "DOCUMENT",
          visibility: "PUBLIC",
          maxBytes: 1024,
        },
        store
      )
    ).rejects.toThrow(/does not match/);

    await expect(
      ingestMedia(
        {
          bytes: Buffer.from("not media"),
          filename: "unknown.bin",
          kind: "DOCUMENT",
          visibility: "PRIVATE",
          maxBytes: 1024,
        },
        store
      )
    ).rejects.toThrow(MediaValidationError);

    await expect(
      ingestMedia(
        {
          bytes: PDF,
          filename: "resume.pdf",
          kind: "DOCUMENT",
          visibility: "PRIVATE",
          maxBytes: 1,
        },
        store
      )
    ).rejects.toThrow(/configured maximum/);
  });

  it("normalizes public filenames without trusting their extension", () => {
    expect(safeDisplayName("Résumé.final.exe", "pdf")).toBe("Résumé.final.pdf");
    expect(safeDisplayName("...", "png")).toBe("upload.png");
  });

  it("quarantines active, malformed, and over-limit PDF files without promoting them", async () => {
    const writes: Array<{
      key: string;
      bytes: Uint8Array;
      contentType: string;
    }> = [];
    const store = {
      put: async (
        key: string,
        bytes: Uint8Array,
        options: { readonly contentType: string }
      ) => void writes.push({ key, bytes, contentType: options.contentType }),
      remove: async () => undefined,
    };
    const rejected = [
      Buffer.from(
        "%PDF-1.7\n1 0 obj\n<< /Type /Page /OpenAction 2 0 R >>\nendobj\n%%EOF\n"
      ),
      Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n"),
      Buffer.from(
        "%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n%%EOF\n"
      ),
    ];

    for (const [index, bytes] of rejected.entries()) {
      const promise = ingestMedia(
        {
          bytes,
          filename: `unsafe-${index}.pdf`,
          kind: "DOCUMENT",
          visibility: "PUBLIC",
          maxBytes: 4096,
          maxPdfPages: index === 2 ? 1 : 10,
        },
        store
      );
      await expect(promise).rejects.toBeInstanceOf(MediaQuarantinedError);
    }

    expect(writes).toHaveLength(3);
    expect(writes.every(({ key }) => key.startsWith("quarantine/"))).toBe(true);
    expect(
      writes.every(
        ({ contentType }) => contentType === "application/octet-stream"
      )
    ).toBe(true);
    expect(writes.map(({ bytes }) => Buffer.from(bytes))).toEqual(rejected);
  });

  it("decodes and re-encodes images while removing metadata", async () => {
    const source = await sharp({
      create: {
        width: 4,
        height: 3,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: "private-author" } } })
      .toBuffer();
    let stored: Uint8Array | undefined;
    const result = await ingestMedia(
      {
        bytes: source,
        filename: "photo.jpg",
        kind: "IMAGE",
        visibility: "PUBLIC",
        maxBytes: 1024 * 1024,
      },
      {
        put: async (_key, bytes) => {
          stored = bytes;
        },
        remove: async () => undefined,
      }
    );

    expect(result).toMatchObject({
      width: 4,
      height: 3,
      mimeType: "image/jpeg",
    });
    expect(stored).toBeDefined();
    const metadata = await sharp(Buffer.from(stored!)).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  it("quarantines decoded images that exceed the configured dimensions", async () => {
    const source = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const keys: string[] = [];

    await expect(
      ingestMedia(
        {
          bytes: source,
          filename: "large.png",
          kind: "IMAGE",
          visibility: "PUBLIC",
          maxBytes: 1024 * 1024,
          maxWidth: 2,
          maxHeight: 2,
        },
        {
          put: async (key) => void keys.push(key),
          remove: async () => undefined,
        }
      )
    ).rejects.toBeInstanceOf(MediaQuarantinedError);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^quarantine\//);
  });

  it("rejects object-store traversal even when called outside ingestion", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "portfolio-media-"));
    try {
      await expect(
        new LocalMediaObjectStore(root).put("../escape.pdf", PDF, {
          contentType: "application/pdf",
        })
      ).rejects.toThrow(/application media key/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("quarantines an article source byte-for-byte under a private random key", async () => {
    const bytes = Buffer.from(
      "# Original MDX\n\n{dangerousExpression}\n",
      "utf8"
    );
    const writes: Array<{
      key: string;
      bytes: Uint8Array;
      contentType: string;
    }> = [];
    const result = await quarantineArticleSource(
      { bytes, filename: "../../draft.mdx", maxBytes: 1024 },
      {
        put: async (key, value, options) =>
          void writes.push({
            key,
            bytes: value,
            contentType: options.contentType,
          }),
        remove: async () => undefined,
      }
    );

    expect(result).toMatchObject({
      displayName: "draft.mdx",
      kind: "DOCUMENT",
      processingState: "QUARANTINED",
      visibility: "PRIVATE",
    });
    expect(result.storageKey).toMatch(/^quarantine\/[0-9a-f-]{36}\.mdx$/u);
    expect(writes).toHaveLength(1);
    expect(Buffer.from(writes[0]?.bytes ?? [])).toEqual(bytes);
    expect(writes[0]?.contentType).toBe("application/octet-stream");
  });
});
