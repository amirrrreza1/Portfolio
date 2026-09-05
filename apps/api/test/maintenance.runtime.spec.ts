import type { Database } from "@portfolio/database";
import type { MediaObjectStore } from "@portfolio/media";
import { describe, expect, it, vi } from "vitest";

import type { ContactDelivery } from "../src/modules/contact/contact.service.js";
import { createMaintenanceOperations } from "../src/worker/maintenance.runtime.js";

function delegate(id: string) {
  return {
    findMany: vi.fn().mockResolvedValue([{ id }]),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
}

describe("maintenance retention runtime", () => {
  it("applies audit, auth, challenge, and draft windows in bounded batches", async () => {
    const auditEvent = delegate("audit-1");
    const webAuthnChallenge = delegate("challenge-1");
    const session = delegate("session-1");
    const recoveryCode = delegate("code-1");
    const postDraft = delegate("draft-1");
    const database = {
      siteSettings: {
        findUnique: vi.fn().mockResolvedValue({ auditRetentionDays: 400 }),
      },
      auditEvent,
      webAuthnChallenge,
      session,
      recoveryCode,
      postDraft,
    } as unknown as Database;
    const at = new Date("2026-09-05T12:00:00.000Z");
    const operations = createMaintenanceOperations({
      database,
      media: {} as MediaObjectStore,
      delivery: {} as ContactDelivery,
      now: () => at,
      maxContactAttempts: 5,
      draftRetentionDays: 30,
      mediaRetentionDays: 30,
      quarantineRetentionDays: 14,
    });

    await expect(operations.purgeRetentionArtifacts(25)).resolves.toEqual({
      auditEvents: 1,
      webAuthnChallenges: 1,
      sessions: 1,
      recoveryCodes: 1,
      drafts: 1,
    });
    expect(auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 })
    );
    expect(webAuthnChallenge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { expiresAt: { lte: at } } })
    );
    expect(postDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { updatedAt: { lte: new Date("2026-08-06T12:00:00.000Z") } },
      })
    );
    for (const model of [
      auditEvent,
      webAuthnChallenge,
      session,
      recoveryCode,
      postDraft,
    ]) {
      expect(model.deleteMany).toHaveBeenCalledOnce();
    }
  });

  it("does nothing until singleton retention settings exist", async () => {
    const database = {
      siteSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as Database;
    const operations = createMaintenanceOperations({
      database,
      media: {} as MediaObjectStore,
      delivery: {} as ContactDelivery,
      maxContactAttempts: 5,
      draftRetentionDays: 30,
      mediaRetentionDays: 30,
      quarantineRetentionDays: 14,
    });

    await expect(operations.purgeRetentionArtifacts(25)).resolves.toEqual({
      auditEvents: 0,
      webAuthnChallenges: 0,
      sessions: 0,
      recoveryCodes: 0,
      drafts: 0,
    });
  });
});
