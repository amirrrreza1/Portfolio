import type { PasswordLoginStore } from "@portfolio/auth-core";

import type { Database } from "./client.js";

/**
 * Prisma adapter for the password step of login.
 *
 * It reads and records; it creates nothing. The step used to mint a session
 * here, which meant a correct password alone produced a usable cookie for a
 * flow that requires a passkey as well. Session creation now belongs to the
 * assertion step, and lives with the rest of the session adapter in the API's
 * auth module — where the port it satisfies is declared.
 */
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
    async recordSuccessfulPasswordLogin(userId) {
      await database.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      });
    },
  };
}
