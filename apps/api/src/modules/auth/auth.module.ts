import { Module } from "@nestjs/common";

import {
  AUTH_RUNTIME_CONFIG,
  AUTH_SERVICE,
  AuthController,
  type AuthRuntimeConfig,
} from "./auth.controller.js";
import { createAuthRuntime, type AuthRuntime } from "./auth.runtime.js";
import type { AuthService } from "./auth.service.js";

/**
 * The runtime is built once and shared by both providers.
 *
 * Building it twice would create two `AuthService` instances, and the login
 * throttle lives in the instance — two of them means an attacker gets two
 * budgets, which is the sort of thing that is invisible until someone counts.
 */
let runtime: Promise<AuthRuntime> | null = null;

function sharedRuntime(): Promise<AuthRuntime> {
  runtime ??= createAuthRuntime();
  return runtime;
}

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_SERVICE,
      useFactory: async (): Promise<AuthService> =>
        (await sharedRuntime()).service,
    },
    {
      provide: AUTH_RUNTIME_CONFIG,
      useFactory: async (): Promise<AuthRuntimeConfig> => {
        const resolved = await sharedRuntime();
        return {
          origin: resolved.origin,
          csrfSecret: resolved.csrfSecret,
          hashSecret: resolved.hashSecret,
          secureCookies: resolved.origin.startsWith("https://"),
        };
      },
    },
  ],
  exports: [AUTH_SERVICE, AUTH_RUNTIME_CONFIG],
})
export class AuthModule {}
