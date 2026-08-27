import { VersioningType } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import multipart from "@fastify/multipart";

export function configureApplication(app: NestFastifyApplication): void {
  // @fastify/multipart and Nest's adapter resolve structurally identical
  // Fastify instances through separate declaration paths in this workspace.
  void app.register(multipart as never, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 4,
      parts: 5,
    },
  });
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.enableShutdownHooks();
}

/**
 * Application options every entrypoint must use.
 *
 * Deliberately empty. It held `rawBody: true`, which existed for exactly one
 * reason: the inbound Git content webhook verified an HMAC over the bytes
 * GitHub sent, and re-serializing a parsed body produces a different byte
 * string. ADR-015 removed that webhook, and nothing in this application reads
 * `req.rawBody` any more, so buffering every request body would be a cost paid
 * for a caller that no longer exists.
 *
 * The export stays so that `main.ts` and the smoke test construct the
 * application the same way, and so the next option that is genuinely required
 * has one place to be added rather than two.
 */
export const APPLICATION_OPTIONS = {} as const;
