/**
 * Bounded operational housekeeping.
 *
 * The runtime owns PostgreSQL/MinIO/SMTP details; this loop owns scheduling and
 * observable outcomes. Every pass is bounded so a large historical backlog
 * cannot monopolize the maintenance process or its advisory lock forever.
 */
export interface MaintenanceOperations {
  purgeExpiredContacts(limit: number): Promise<number>;
  retryFailedContacts(limit: number): Promise<{
    readonly sent: number;
    readonly failed: number;
    readonly exhausted: number;
  }>;
  purgeExpiredImportReports(limit: number): Promise<number>;
  cleanupOrphanedMedia(limit: number): Promise<{
    readonly deleted: number;
    readonly failed: number;
  }>;
}

export interface MaintenanceSummary {
  readonly expiredContacts: number;
  readonly contactsSent: number;
  readonly contactsFailed: number;
  readonly contactsExhausted: number;
  readonly expiredImportReports: number;
  readonly mediaDeleted: number;
  readonly mediaDeleteFailures: number;
}

export async function runMaintenancePass(
  operations: MaintenanceOperations,
  limit: number
): Promise<MaintenanceSummary> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error("Maintenance batch limit must be between 1 and 10000.");
  }

  const expiredContacts = await operations.purgeExpiredContacts(limit);
  const contactRetry = await operations.retryFailedContacts(limit);
  const expiredImportReports =
    await operations.purgeExpiredImportReports(limit);
  const media = await operations.cleanupOrphanedMedia(limit);

  return {
    expiredContacts,
    contactsSent: contactRetry.sent,
    contactsFailed: contactRetry.failed,
    contactsExhausted: contactRetry.exhausted,
    expiredImportReports,
    mediaDeleted: media.deleted,
    mediaDeleteFailures: media.failed,
  };
}

export async function runMaintenanceLoop(options: {
  readonly operations: MaintenanceOperations;
  readonly batchSize: number;
  readonly intervalMs: number;
  readonly running: () => boolean;
  readonly sleep: (ms: number) => Promise<void>;
  readonly log?: (summary: MaintenanceSummary) => void;
}): Promise<void> {
  while (options.running()) {
    const summary = await runMaintenancePass(
      options.operations,
      options.batchSize
    );
    options.log?.(summary);
    await options.sleep(options.intervalMs);
  }
}
