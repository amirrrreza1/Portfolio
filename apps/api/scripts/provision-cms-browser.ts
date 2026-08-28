/** Disposable owner fixture for the real-browser M7 proof. */
import { hashPassword, recoveryCodeHash } from "@portfolio/auth-core";
import { createDatabaseClient } from "@portfolio/database";

if (!process.argv.includes("--apply")) {
  throw new Error("Refusing browser-fixture provisioning without --apply.");
}
const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const recoveryHash = recoveryCodeHash(
  required("RECOVERY_SECRET"),
  required("E2E_CMS_OWNER_RECOVERY_CODE")
);
if (recoveryHash === null)
  throw new Error("The recovery code format is invalid.");
const database = createDatabaseClient({
  connectionString: required("DATABASE_URL"),
});
const email = required("E2E_CMS_OWNER_EMAIL");

try {
  const existing = await database.user.findUnique({ where: { email } });
  if (existing !== null) {
    await database.session.deleteMany({ where: { userId: existing.id } });
    await database.recoveryCode.deleteMany({ where: { userId: existing.id } });
    await database.webAuthnCredential.deleteMany({
      where: { userId: existing.id },
    });
    await database.user.update({
      where: { id: existing.id },
      data: {
        displayName: "M7 browser owner",
        role: "OWNER",
        status: "ACTIVE",
        passwordHash: await hashPassword(required("E2E_CMS_OWNER_PASSWORD")),
        passwordChangedAt: new Date(),
      },
    });
    await database.recoveryCode.create({
      data: { userId: existing.id, codeHash: recoveryHash },
    });
  } else {
    await database.user.create({
      data: {
        email,
        displayName: "M7 browser owner",
        role: "OWNER",
        status: "ACTIVE",
        passwordHash: await hashPassword(required("E2E_CMS_OWNER_PASSWORD")),
        passwordChangedAt: new Date(),
        recoveryCodes: { create: { codeHash: recoveryHash } },
      },
    });
  }
  process.stdout.write("M7 browser owner provisioned.\n");
} finally {
  await database.$disconnect();
}
