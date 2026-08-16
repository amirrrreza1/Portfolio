import { VersioningType } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

export function configureApplication(app: NestFastifyApplication): void {
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.enableShutdownHooks();
}

/**
 * Application options every entrypoint must use.
 *
 * `rawBody` is not optional here. The Git webhook's HMAC is computed over the
 * bytes GitHub sent, and re-serializing the parsed body produces a different
 * byte string — key order, whitespace, unicode escaping. A signature check
 * against re-serialized JSON fails on every legitimate delivery, and the
 * failure mode that matters is the fix someone reaches for next: skipping
 * verification because "the signature never matches".
 *
 * Nest's own option is used rather than a hand-registered content-type parser,
 * because Nest registers its JSON parser during `init()` and a second one for
 * the same type is a startup error.
 */
export const APPLICATION_OPTIONS = { rawBody: true } as const;
