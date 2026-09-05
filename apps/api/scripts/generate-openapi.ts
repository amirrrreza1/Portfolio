import { writeFile } from "node:fs/promises";

import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

const placeholderEnvironment = {
  DATABASE_URL: "postgresql://openapi:openapi@127.0.0.1:5432/openapi",
  SMTP_URL: "smtp://127.0.0.1:1025",
  CONTACT_FROM_EMAIL: "openapi@example.invalid",
  MINIO_ENDPOINT: "http://127.0.0.1:9000",
  MINIO_REGION: "us-east-1",
  MINIO_BUCKET: "openapi-media",
  MINIO_ACCESS_KEY_ID: "openapi",
  MINIO_SECRET_ACCESS_KEY: "openapi-placeholder",
  SESSION_SECRET: "openapi-session-secret-32-bytes-minimum",
  CSRF_SECRET: "openapi-csrf-secret-different-32-bytes",
  RECOVERY_SECRET: "openapi-recovery-secret-third-32-bytes",
  WEBAUTHN_RP_ID: "example.invalid",
  WEBAUTHN_RP_NAME: "Portfolio Admin",
  WEBAUTHN_ORIGIN: "https://example.invalid",
} as const;
for (const [key, value] of Object.entries(placeholderEnvironment)) {
  process.env[key] ??= value;
}

const [{ AppModule }, { APPLICATION_OPTIONS, configureApplication }] =
  await Promise.all([
    import("../src/app.module.js"),
    import("../src/configure-app.js"),
  ]);

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ logger: false }),
  { ...APPLICATION_OPTIONS, logger: false }
);
try {
  configureApplication(app);
  const config = new DocumentBuilder()
    .setTitle("Portfolio API")
    .setDescription("Public and authenticated owner operations")
    .setVersion("1")
    .addCookieAuth("portfolio_session")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  await writeFile(
    new URL("../../../docs/openapi.json", import.meta.url),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8"
  );
} finally {
  await app.close();
}
