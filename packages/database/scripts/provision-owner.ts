import { readFile } from "node:fs/promises";

import { hashPassword, issueRecoveryCodes } from "@portfolio/auth-core";
import { ownerProvisioningSchema } from "@portfolio/contracts/auth";

import { createDatabaseClient } from "../src/client.js";

if (!process.argv.includes("--apply")) {
  throw new Error(
    "Refusing owner provisioning without the explicit --apply flag."
  );
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("replace_") || value.includes("change_me")) {
    throw new Error(name + " must be set to a non-placeholder value.");
  }
  return value;
};

const expiry = new Date(required("OWNER_BOOTSTRAP_EXPIRES_AT"));
if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
  throw new Error("OWNER_BOOTSTRAP_EXPIRES_AT must be a future ISO timestamp.");
}
const token = (
  await readFile(required("OWNER_BOOTSTRAP_TOKEN_FILE"), "utf8")
).trim();
const input = ownerProvisioningSchema.parse({
  email: required("OWNER_EMAIL"),
  displayName: required("OWNER_DISPLAY_NAME"),
  password: required("OWNER_INITIAL_PASSWORD"),
  bootstrapToken: token,
});
/**
 * Recovery codes are part of provisioning, not an optional extra.
 *
 * A freshly provisioned owner has a password and nothing else. Login requires
 * a passkey assertion; enrolling a passkey requires an authenticated session;
 * and the only way to obtain a session without a passkey is a recovery code.
 * An owner provisioned without codes is therefore an owner who can never sign
 * in — the bootstrap has no first step. Issuing them here is what closes that
 * loop: a code buys the first session, and the first passkey is enrolled from
 * it.
 *
 * Ten is the count SECURITY.md §3 implies by requiring codes be single-use and
 * displayed once: enough to survive a few lost devices without becoming a
 * standing password list.
 */
const RECOVERY_CODE_COUNT = 10;

const recoverySecret = required("RECOVERY_SECRET");

const database = createDatabaseClient({
  connectionString: required("DATABASE_URL"),
});

try {
  const codes = issueRecoveryCodes(recoverySecret, RECOVERY_CODE_COUNT);

  await database.$transaction(async (prisma) => {
    if ((await prisma.user.count({ where: { role: "OWNER" } })) !== 0) {
      throw new Error("Owner provisioning has already been completed.");
    }
    const owner = await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: await hashPassword(input.password),
        role: "OWNER",
        passwordChangedAt: new Date(),
      },
    });
    // Only the keyed hashes are stored. The codes themselves exist in this
    // process's memory and in the operator's terminal, and nowhere else.
    await prisma.recoveryCode.createMany({
      data: codes.map((code) => ({
        userId: owner.id,
        codeHash: code.hash,
      })),
    });
  });

  console.log("Owner provisioned.");
  console.log("");
  console.log("Recovery codes — shown once, stored only as hashes:");
  for (const code of codes) console.log(`  ${code.displayCode}`);
  console.log("");
  console.log(
    "Save these now, sign in with one, and enrol a passkey immediately."
  );
} finally {
  await database.$disconnect();
}
