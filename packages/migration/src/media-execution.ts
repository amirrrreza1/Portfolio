import {
  ingestMedia,
  type MediaObjectStore,
  type VerifiedMedia,
} from "@portfolio/media";

import { applyLegacyMigration, type LegacyMigrationStore } from "./apply.js";
import {
  assertMigrationReady,
  planLegacyMigration,
  type LegacySnapshot,
} from "./index.js";

export interface LegacyMediaExecutorInput {
  readonly snapshot: LegacySnapshot;
  readonly store: LegacyMigrationStore;
  readonly objectStore: MediaObjectStore;
  /** Reads one validated legacy public path without exposing arbitrary files. */
  readonly readLegacyFile: (sourcePath: string) => Promise<Uint8Array>;
  readonly maxDocumentBytes: number;
}

export interface LegacyMediaExecutorResult {
  readonly applied: boolean;
  readonly skipped: boolean;
  readonly uploadedCount: number;
}

/**
 * Coordinates external object writes with the single database transaction.
 * A prior successful ledger entry skips object writes. When the database
 * transaction fails, every object created in this attempt is removed again.
 */
export async function executeLegacyMediaMigration(
  input: LegacyMediaExecutorInput
): Promise<LegacyMediaExecutorResult> {
  const plan = planLegacyMigration(input.snapshot);
  assertMigrationReady(plan);

  const previous = await input.store.appliedChecksum(plan.version);
  if (previous === plan.sourceChecksum) {
    return { applied: false, skipped: true, uploadedCount: 0 };
  }
  if (previous !== null) {
    throw new Error(
      "Migration version " +
        plan.version +
        " was applied with a different source checksum."
    );
  }

  const uploaded: VerifiedMedia[] = [];
  try {
    const certificatesBySourcePath = new Map<string, VerifiedMedia>();
    for (const certificate of plan.certificates) {
      const media = await ingestLegacyPdf(
        certificate.sourcePath,
        "PUBLIC",
        input,
        uploaded
      );
      certificatesBySourcePath.set(certificate.sourcePath, media);
    }
    const resume = await ingestLegacyPdf(
      "/resume.pdf",
      "PRIVATE",
      input,
      uploaded
    );
    const result = await applyLegacyMigration(input.store, input.snapshot, {
      certificatesBySourcePath,
      resume,
    });
    if (!result.applied) {
      // Another runner can commit after the first ledger read but before this
      // transaction. Its inner ledger check is authoritative, so compensate
      // this runner's otherwise-unreferenced objects before reporting a skip.
      await removeUploadedObjects(input.objectStore, uploaded);
      return { applied: false, skipped: true, uploadedCount: 0 };
    }
    return {
      applied: true,
      skipped: false,
      uploadedCount: uploaded.length,
    };
  } catch (error) {
    await removeUploadedObjects(input.objectStore, uploaded);
    throw error;
  }
}

async function ingestLegacyPdf(
  sourcePath: string,
  visibility: "PUBLIC" | "PRIVATE",
  input: LegacyMediaExecutorInput,
  uploaded: VerifiedMedia[]
): Promise<VerifiedMedia> {
  const media = await ingestMedia(
    {
      bytes: await input.readLegacyFile(sourcePath),
      filename: sourcePath.split("/").at(-1) ?? "document.pdf",
      kind: "DOCUMENT",
      visibility,
      maxBytes: input.maxDocumentBytes,
    },
    input.objectStore
  );
  uploaded.push(media);
  return media;
}

async function removeUploadedObjects(
  objectStore: MediaObjectStore,
  uploaded: readonly VerifiedMedia[]
): Promise<void> {
  const failures: unknown[] = [];
  for (const media of [...uploaded].reverse()) {
    try {
      await objectStore.remove(media.storageKey);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    console.error(
      "Legacy migration cleanup could not remove " +
        failures.length +
        " object(s); manual reconciliation is required."
    );
  }
}
