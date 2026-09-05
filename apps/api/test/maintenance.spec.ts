import { describe, expect, it, vi } from "vitest";

import {
  runMaintenanceLoop,
  runMaintenancePass,
  type MaintenanceOperations,
} from "../src/worker/maintenance.js";

function operations(): MaintenanceOperations {
  return {
    purgeExpiredContacts: vi.fn().mockResolvedValue(2),
    retryFailedContacts: vi
      .fn()
      .mockResolvedValue({ sent: 1, failed: 1, exhausted: 1 }),
    purgeExpiredImportReports: vi.fn().mockResolvedValue(3),
    cleanupOrphanedMedia: vi.fn().mockResolvedValue({ deleted: 4, failed: 1 }),
  };
}

describe("operational maintenance", () => {
  it("reports every bounded cleanup and retry outcome", async () => {
    await expect(runMaintenancePass(operations(), 50)).resolves.toEqual({
      expiredContacts: 2,
      contactsSent: 1,
      contactsFailed: 1,
      contactsExhausted: 1,
      expiredImportReports: 3,
      mediaDeleted: 4,
      mediaDeleteFailures: 1,
    });
  });

  it("rejects an unbounded batch", async () => {
    await expect(runMaintenancePass(operations(), 0)).rejects.toThrow(
      /between 1 and 10000/
    );
  });

  it("sleeps between observable passes and stops gracefully", async () => {
    const run = operations();
    let running = true;
    const log = vi.fn();
    await runMaintenanceLoop({
      operations: run,
      batchSize: 25,
      intervalMs: 1_000,
      running: () => running,
      sleep: async () => {
        running = false;
      },
      log,
    });
    expect(log).toHaveBeenCalledOnce();
  });
});
