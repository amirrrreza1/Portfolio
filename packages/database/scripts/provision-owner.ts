import { readFile } from "node:fs/promises";

import { hashPassword } from "@portfolio/auth-core";
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
const database = createDatabaseClient({
  connectionString: required("DATABASE_URL"),
});

try {
  await database.$transaction(async (prisma) => {
    if ((await prisma.user.count({ where: { role: "OWNER" } })) !== 0) {
      throw new Error("Owner provisioning has already been completed.");
    }
    await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: await hashPassword(input.password),
        role: "OWNER",
        passwordChangedAt: new Date(),
      },
    });
  });
  console.log("Owner provisioned.");
} finally {
  await database.$disconnect();
}
