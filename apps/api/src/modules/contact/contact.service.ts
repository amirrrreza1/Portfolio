import type { ContactSubmission } from "@portfolio/contracts/contact";

export interface ContactSettings {
  readonly enabled: boolean;
  readonly recipientEmail: string;
  readonly retentionDays: number;
}

export interface ContactMessageStore {
  getSettings(): Promise<ContactSettings | null>;
  createPending(
    submission: ContactSubmission,
    deletionDueAt: Date
  ): Promise<string>;
  markSent(id: string, providerMessageRef: string | null): Promise<void>;
  markFailed(
    id: string,
    failure: { readonly code: string; readonly nextAttemptAt: Date }
  ): Promise<void>;
}

export interface ContactDelivery {
  send(
    recipientEmail: string,
    submission: ContactSubmission
  ): Promise<string | null>;
}

interface RateLimitEntry {
  readonly startedAt: number;
  count: number;
}

/** A bounded process-local baseline; production also enforces this at the edge. */
export class ContactSubmissionService {
  private readonly attempts = new Map<string, RateLimitEntry>();

  public constructor(
    private readonly store: ContactMessageStore,
    private readonly delivery: ContactDelivery,
    private readonly now: () => Date = () => new Date()
  ) {}

  async submit(
    submission: ContactSubmission,
    clientKey: string
  ): Promise<void> {
    // Bots receive the same acknowledgement as visitors, preventing delivery
    // probing through these inexpensive signals.
    if (submission.company || this.finishedTooQuickly(submission.startedAt)) {
      return;
    }
    if (!this.consumeRateLimit(clientKey)) return;

    const settings = await this.store.getSettings();
    if (!settings?.enabled) return;

    const deletionDueAt = new Date(this.now());
    deletionDueAt.setUTCDate(
      deletionDueAt.getUTCDate() + settings.retentionDays
    );
    const messageId = await this.store.createPending(submission, deletionDueAt);

    try {
      const providerMessageRef = await this.delivery.send(
        settings.recipientEmail,
        submission
      );
      await this.store.markSent(messageId, providerMessageRef);
    } catch {
      // Retain durable evidence for the owner/retry path without exposing a
      // provider failure to a public sender.
      const nextAttemptAt = new Date(this.now().getTime() + 5 * 60 * 1_000);
      await this.store.markFailed(messageId, {
        code: "smtp_delivery_failed",
        nextAttemptAt,
      });
    }
  }

  private finishedTooQuickly(startedAt: number | undefined): boolean {
    return startedAt === undefined || this.now().getTime() - startedAt < 3_000;
  }

  private consumeRateLimit(clientKey: string): boolean {
    const now = this.now().getTime();
    const hour = 60 * 60 * 1_000;
    const existing = this.attempts.get(clientKey);

    if (!existing || now - existing.startedAt >= hour) {
      this.attempts.set(clientKey, { startedAt: now, count: 1 });
      return true;
    }
    if (existing.count >= 3) return false;

    existing.count += 1;
    return true;
  }
}
