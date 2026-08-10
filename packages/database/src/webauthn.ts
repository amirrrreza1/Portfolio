import type {
  WebAuthnChallengeRecord,
  WebAuthnChallengeStore,
} from "@portfolio/auth-core";

import type { Database } from "./client.js";

/** Prisma-backed, delete-on-read challenge store shared by every API replica. */
export function createWebAuthnChallengeStore(
  database: Database
): WebAuthnChallengeStore {
  return {
    async create(record) {
      await database.webAuthnChallenge.create({ data: record });
    },
    async consume(id) {
      try {
        const record = await database.webAuthnChallenge.delete({
          where: { id },
        });
        return {
          id: record.id,
          challenge: record.challenge,
          purpose: record.purpose,
          userId: record.userId,
          expiresAt: record.expiresAt,
        } satisfies WebAuthnChallengeRecord;
      } catch (error: any) {
        if (error?.code === "P2025") return null;
        throw error;
      }
    },
  };
}
