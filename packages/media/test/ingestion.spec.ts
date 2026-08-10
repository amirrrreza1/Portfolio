import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ingestMedia,
  LocalMediaObjectStore,
  MediaValidationError,
  safeDisplayName,
} from "../src/index.js";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "utf8");
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
});
