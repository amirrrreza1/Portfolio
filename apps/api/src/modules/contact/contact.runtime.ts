import { createHash } from "node:crypto";

import { getDatabaseClient, type Database } from "@portfolio/database";
import nodemailer from "nodemailer";

import type {
  ContactDelivery,
  ContactMessageStore,
  ContactSettings,
} from "./contact.service.js";

export function createDatabaseContactMessageStore(
  database: Database
): ContactMessageStore {
  return {
    async getSettings(): Promise<ContactSettings | null> {
      const settings = await database.siteSettings.findUnique({
        where: { id: 1 },
        select: {
          contactEnabled: true,
          contactRecipientEmail: true,
          contactRetentionDays: true,
        },
      });
      return settings
        ? {
            enabled: settings.contactEnabled,
            recipientEmail: settings.contactRecipientEmail,
            retentionDays: settings.contactRetentionDays,
          }
        : null;
    },
    async createPending(submission, deletionDueAt): Promise<string> {
      const created = await database.contactMessage.create({
        data: {
          name: submission.name,
          email: submission.email,
          message: submission.message,
          deletionDueAt,
        },
        select: { id: true },
      });
      return created.id;
    },
    async markSent(id, providerMessageRef): Promise<void> {
      await database.contactMessage.update({
        where: { id },
        data: {
          deliveryStatus: "SENT",
          providerMessageRef,
          deliveredAt: new Date(),
          deliveryAttempts: { increment: 1 },
          nextAttemptAt: null,
          lastError: null,
        },
      });
    },
    async markFailed(id, failure): Promise<void> {
      await database.contactMessage.update({
        where: { id },
        data: {
          deliveryStatus: "FAILED",
          deliveryAttempts: { increment: 1 },
          nextAttemptAt: failure.nextAttemptAt,
          lastError: failure.code.slice(0, 160),
        },
      });
    },
  };
}

export function createSmtpContactDelivery(
  smtpUrl: string | undefined,
  from: string | undefined
): ContactDelivery {
  if (!smtpUrl || !from) {
    throw new Error("SMTP_URL and CONTACT_FROM_EMAIL are required.");
  }

  const transport = nodemailer.createTransport(smtpUrl, {
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });

  return {
    async send(recipientEmail, submission): Promise<string | null> {
      const result = await transport.sendMail({
        from,
        to: recipientEmail,
        replyTo: submission.email,
        subject: "Portfolio contact message",
        text: `Name: ${submission.name}\nEmail: ${submission.email}\n\n${submission.message}`,
      });
      return result.messageId || null;
    },
  };
}

export function createContactClientKey(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export function createContactStoreFromEnvironment(): ContactMessageStore {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  return createDatabaseContactMessageStore(
    getDatabaseClient({ connectionString })
  );
}
