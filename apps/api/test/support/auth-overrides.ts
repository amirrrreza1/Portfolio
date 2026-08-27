import type { TestingModuleBuilder } from "@nestjs/testing";

import {
  AUTH_RUNTIME_CONFIG,
  AUTH_SERVICE,
} from "../../src/modules/auth/auth.controller.js";

/**
 * Stands the auth module down for tests that only care about other routes.
 *
 * `AuthModule` parses the environment when Nest builds its providers, which is
 * deliberate — an API that boots without session secrets is an API that
 * discovers it cannot authenticate anyone at the first login attempt. The cost
 * is that every test constructing the whole `AppModule` has to say what it
 * wants auth to be, the same way it already does for contact delivery.
 */
export function withStubbedAuth(
  builder: TestingModuleBuilder
): TestingModuleBuilder {
  return builder
    .overrideProvider(AUTH_SERVICE)
    .useValue({
      authenticate: async () => null,
    })
    .overrideProvider(AUTH_RUNTIME_CONFIG)
    .useValue({
      origin: "https://admin.example.test",
      csrfSecret: "c".repeat(40),
      hashSecret: "s".repeat(40),
      secureCookies: true,
    });
}
