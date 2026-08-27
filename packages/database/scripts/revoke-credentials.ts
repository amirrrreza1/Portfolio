import { createDatabaseClient } from "../src/client.js";

/**
 * The operator half of credential revocation.
 *
 * API_SPEC.md §5 lists ten authentication endpoints and none of them deletes a
 * passkey. That is deliberate: an endpoint that removes a credential is an
 * endpoint an attacker who already holds a session can use to strip the owner
 * of every way back in. So revocation of a *key* — as opposed to a session —
 * is a deployment action, performed by someone with database access, which is
 * the same trust level that provisioned the account in the first place.
 *
 * This exists rather than a hand-written `DELETE` because the incident runbook
 * has to be rehearsable. A step that reads "delete the right row and remember
 * to clear the sessions too" is a step that gets done wrong at three in the
 * morning: removing the credential alone leaves every session it authenticated
 * still valid, which revokes nothing an attacker cares about.
 *
 * Usage:
 *   tsx scripts/revoke-credentials.ts --email owner@example.com --list
 *   tsx scripts/revoke-credentials.ts --email owner@example.com \
 *       --credential <id> --apply
 *   tsx scripts/revoke-credentials.ts --email owner@example.com --all --apply
 *
 * `--all` leaves the account with no passkey. That is a valid incident
 * response and it is also a lockout unless recovery codes remain, so it says
 * so before it does it.
 */

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const email = argument("email")?.trim().toLowerCase();
if (!email) throw new Error("--email is required.");

const listOnly = flag("list");
const revokeAll = flag("all");
const credentialId = argument("credential");

if (!listOnly && !revokeAll && credentialId === undefined) {
  throw new Error("Pass --list, --credential <id>, or --all.");
}
if (!listOnly && !flag("apply")) {
  throw new Error("Refusing to revoke without the explicit --apply flag.");
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const database = createDatabaseClient({ connectionString });

try {
  const user = await database.user.findUnique({
    where: { email },
    select: { id: true, displayName: true },
  });
  if (user === null) throw new Error(`No account for ${email}.`);

  const credentials = await database.webAuthnCredential.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      label: true,
      createdAt: true,
      lastUsedAt: true,
      deviceType: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Account: ${email} (${user.displayName})`);
  console.log(`Passkeys: ${credentials.length}`);
  for (const credential of credentials) {
    console.log(
      `  ${credential.id}  ${credential.label ?? "(unlabelled)"}` +
        `  registered ${credential.createdAt.toISOString()}` +
        `  last used ${credential.lastUsedAt?.toISOString() ?? "never"}`
    );
  }

  if (listOnly) {
    console.log("\nList only. Nothing was changed.");
  } else {
    const targets = revokeAll
      ? credentials.map((credential) => credential.id)
      : [credentialId as string];
    const unknown = targets.filter(
      (id) => !credentials.some((credential) => credential.id === id)
    );
    if (unknown.length > 0) {
      throw new Error(`Not a passkey on this account: ${unknown.join(", ")}`);
    }

    const remaining = credentials.length - targets.length;
    const usableCodes = await database.recoveryCode.count({
      where: { userId: user.id, usedAt: null },
    });
    if (remaining === 0 && usableCodes === 0) {
      throw new Error(
        "Refusing: this would remove the last passkey with no unused recovery " +
          "code left, locking the account out permanently. Issue codes first."
      );
    }

    // One transaction. A revocation that removed the key but failed before
    // clearing the sessions would report success while leaving every session
    // that key authenticated still usable.
    const revokedAt = new Date();
    const { sessions } = await database.$transaction(async (prisma) => {
      await prisma.webAuthnCredential.deleteMany({
        where: { id: { in: targets }, userId: user.id },
      });
      const swept = await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt, revokedReason: "SECURITY_CHANGE" },
      });
      await prisma.auditEvent.create({
        data: {
          actorId: user.id,
          eventType: "auth.credential.revoked",
          targetType: "WebAuthnCredential",
          targetId: targets.length === 1 ? (targets[0] as string) : null,
          outcome: "SUCCESS",
          // Counts and identifiers only. A revocation record that repeated the
          // credential's public key or a session token would be an audit trail
          // worth stealing.
          metadata: {
            revokedCredentials: targets.length,
            remainingCredentials: remaining,
            operator: "revoke-credentials script",
          },
        },
      });
      return { sessions: swept.count };
    });

    console.log("");
    console.log(`Revoked ${targets.length} passkey(s).`);
    console.log(`Signed out ${sessions} session(s).`);
    console.log(`Passkeys remaining: ${remaining}.`);
    console.log(`Unused recovery codes: ${usableCodes}.`);
    if (remaining === 0) {
      console.log(
        "No passkey remains. Sign in with a recovery code and enrol one now."
      );
    }
  }
} finally {
  await database.$disconnect();
}
