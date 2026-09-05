import type { ContactSubmission } from "@portfolio/contracts/contact";
import type { Database } from "@portfolio/database";
import type { MediaObjectStore } from "@portfolio/media";

import type { ContactDelivery } from "../modules/contact/contact.service.js";
import type { MaintenanceOperations } from "./maintenance.js";

export interface MaintenanceRuntimeOptions {
  readonly database: Database;
  readonly media: MediaObjectStore;
  readonly delivery: ContactDelivery;
  readonly now?: () => Date;
  readonly maxContactAttempts: number;
  readonly draftRetentionDays: number;
  readonly mediaRetentionDays: number;
  readonly quarantineRetentionDays: number;
}

export function createMaintenanceOperations(
  options: MaintenanceRuntimeOptions
): MaintenanceOperations {
  const now = options.now ?? (() => new Date());

  return {
    async purgeExpiredContacts(limit) {
      const rows = await options.database.contactMessage.findMany({
        where: { deletionDueAt: { lte: now() } },
        orderBy: { deletionDueAt: "asc" },
        take: limit,
        select: { id: true },
      });
      if (rows.length === 0) return 0;
      const deleted = await options.database.contactMessage.deleteMany({
        where: {
          id: { in: rows.map(({ id }) => id) },
          deletionDueAt: { lte: now() },
        },
      });
      return deleted.count;
    },

    async purgeRetentionArtifacts(limit) {
      const at = now();
      const settings = await options.database.siteSettings.findUnique({
        where: { id: 1 },
        select: { auditRetentionDays: true },
      });
      if (settings === null) {
        return {
          auditEvents: 0,
          webAuthnChallenges: 0,
          sessions: 0,
          recoveryCodes: 0,
          drafts: 0,
        };
      }

      const auditCutoff = daysBefore(at, settings.auditRetentionDays);
      const draftCutoff = daysBefore(at, options.draftRetentionDays);
      const [auditEvents, challenges, sessions, recoveryCodes, drafts] =
        await Promise.all([
          ids(
            options.database.auditEvent,
            {
              createdAt: { lte: auditCutoff },
            },
            limit
          ),
          ids(
            options.database.webAuthnChallenge,
            {
              expiresAt: { lte: at },
            },
            limit
          ),
          ids(
            options.database.session,
            {
              OR: [
                { expiresAt: { lte: auditCutoff } },
                { revokedAt: { lte: auditCutoff } },
              ],
            },
            limit
          ),
          ids(
            options.database.recoveryCode,
            {
              usedAt: { lte: auditCutoff },
            },
            limit
          ),
          ids(
            options.database.postDraft,
            {
              updatedAt: { lte: draftCutoff },
            },
            limit
          ),
        ]);

      const [
        deletedAuditEvents,
        deletedChallenges,
        deletedSessions,
        deletedCodes,
        deletedDrafts,
      ] = await Promise.all([
        deleteSelected(options.database.auditEvent, auditEvents, {
          createdAt: { lte: auditCutoff },
        }),
        deleteSelected(options.database.webAuthnChallenge, challenges, {
          expiresAt: { lte: at },
        }),
        deleteSelected(options.database.session, sessions, {
          OR: [
            { expiresAt: { lte: auditCutoff } },
            { revokedAt: { lte: auditCutoff } },
          ],
        }),
        deleteSelected(options.database.recoveryCode, recoveryCodes, {
          usedAt: { lte: auditCutoff },
        }),
        deleteSelected(options.database.postDraft, drafts, {
          updatedAt: { lte: draftCutoff },
        }),
      ]);

      return {
        auditEvents: deletedAuditEvents,
        webAuthnChallenges: deletedChallenges,
        sessions: deletedSessions,
        recoveryCodes: deletedCodes,
        drafts: deletedDrafts,
      };
    },

    async retryFailedContacts(limit) {
      const settings = await options.database.siteSettings.findUnique({
        where: { id: 1 },
        select: { contactEnabled: true, contactRecipientEmail: true },
      });
      if (!settings?.contactEnabled)
        return { sent: 0, failed: 0, exhausted: 0 };

      const at = now();
      const rows = await options.database.contactMessage.findMany({
        where: {
          deliveryStatus: "FAILED",
          nextAttemptAt: { lte: at },
          deletionDueAt: { gt: at },
          deliveryAttempts: { lt: options.maxContactAttempts },
        },
        orderBy: { nextAttemptAt: "asc" },
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          message: true,
          deliveryAttempts: true,
        },
      });

      let sent = 0;
      let failed = 0;
      let exhausted = 0;
      for (const row of rows) {
        const submission: ContactSubmission = {
          name: row.name,
          email: row.email,
          message: row.message,
          company: "",
        };
        try {
          const providerMessageRef = await options.delivery.send(
            settings.contactRecipientEmail,
            submission
          );
          await options.database.contactMessage.update({
            where: { id: row.id },
            data: {
              deliveryStatus: "SENT",
              providerMessageRef,
              deliveredAt: now(),
              deliveryAttempts: { increment: 1 },
              nextAttemptAt: null,
              lastError: null,
            },
          });
          sent += 1;
        } catch {
          const attempts = row.deliveryAttempts + 1;
          const isExhausted = attempts >= options.maxContactAttempts;
          await options.database.contactMessage.update({
            where: { id: row.id },
            data: {
              deliveryStatus: "FAILED",
              deliveryAttempts: { increment: 1 },
              nextAttemptAt: isExhausted
                ? null
                : new Date(now().getTime() + retryDelayMs(attempts)),
              lastError: isExhausted
                ? "smtp_delivery_exhausted"
                : "smtp_delivery_failed",
            },
          });
          failed += 1;
          if (isExhausted) exhausted += 1;
        }
      }
      return { sent, failed, exhausted };
    },

    async purgeExpiredImportReports(limit) {
      const rows = await options.database.articleImportReport.findMany({
        where: { expiresAt: { lte: now() } },
        orderBy: { expiresAt: "asc" },
        take: limit,
        select: { id: true },
      });
      if (rows.length === 0) return 0;
      const deleted = await options.database.articleImportReport.deleteMany({
        where: {
          id: { in: rows.map(({ id }) => id) },
          expiresAt: { lte: now() },
        },
      });
      return deleted.count;
    },

    async cleanupOrphanedMedia(limit) {
      const at = now();
      const archivedBefore = daysBefore(at, options.mediaRetentionDays);
      const quarantinedBefore = daysBefore(at, options.quarantineRetentionDays);
      const unreferenced = {
        projects: { none: {} },
        certificates: { none: {} },
        skills: { none: {} },
        posts: { none: {} },
        postTranslations: { none: {} },
        resumeVersions: { none: {} },
        siteSettings: { none: {} },
        articleImportReports: { none: {} },
      } as const;
      const eligibility = {
        OR: [
          { archivedAt: { lte: archivedBefore } },
          {
            processingState: {
              in: ["FAILED" as const, "QUARANTINED" as const],
            },
            createdAt: { lte: quarantinedBefore },
          },
        ],
        ...unreferenced,
      };
      const rows = await options.database.mediaAsset.findMany({
        where: eligibility,
        orderBy: { createdAt: "asc" },
        take: limit,
        select: { id: true, storageKey: true },
      });

      let deleted = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          await options.media.remove(row.storageKey);
          const result = await options.database.mediaAsset.deleteMany({
            where: { id: row.id, storageKey: row.storageKey, ...eligibility },
          });
          deleted += result.count;
        } catch {
          failed += 1;
        }
      }
      return { deleted, failed };
    },
  };
}

function retryDelayMs(attempts: number): number {
  return Math.min(24 * 60 * 60 * 1_000, 5 * 60 * 1_000 * 2 ** (attempts - 1));
}

function daysBefore(value: Date, days: number): Date {
  return new Date(value.getTime() - days * 24 * 60 * 60 * 1_000);
}

interface DeleteDelegate {
  findMany(args: unknown): Promise<readonly { readonly id: string }[]>;
  deleteMany(args: unknown): Promise<{ readonly count: number }>;
}

async function ids(
  delegate: DeleteDelegate,
  where: unknown,
  limit: number
): Promise<readonly string[]> {
  const rows = await delegate.findMany({
    where,
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map(({ id }) => id);
}

async function deleteSelected(
  delegate: DeleteDelegate,
  selected: readonly string[],
  eligibility: unknown
): Promise<number> {
  if (selected.length === 0) return 0;
  const deleted = await delegate.deleteMany({
    where: { AND: [{ id: { in: selected } }, eligibility] },
  });
  return deleted.count;
}
