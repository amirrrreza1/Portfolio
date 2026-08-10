import type { PasswordLoginStore } from "@portfolio/auth-core";

import type { Database } from "./client.js";

/** Server-only Prisma adapter for the password-login/session boundary. */
export function createPasswordLoginStore(
  database: Database
): PasswordLoginStore {
  return {
    async findByEmail(email) {
      const user = await database.user.findUnique({ where: { email } });
      if (!user) return null;
      return {
        userId: user.id,
        passwordHash: user.passwordHash,
        status: user.status,
      };
    },
    async createSession(input) {
      await database.session.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          csrfBindingHash: input.csrfBindingHash,
          expiresAt: input.expiresAt,
        },
      });
    },
    async recordSuccessfulPasswordLogin(userId) {
      await database.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      });
    },
  };
}
