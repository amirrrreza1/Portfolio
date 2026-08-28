import { HttpException } from "@nestjs/common";
import { authorizeCookieMutation } from "@portfolio/auth-core";
import { CSRF_HEADER_NAME } from "@portfolio/contracts/auth";
import {
  buildErrorBody,
  ERROR_STATUS,
  resourceIdSchema,
  type ErrorCode,
  type FieldErrors,
} from "@portfolio/contracts/common";
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthRuntimeConfig } from "../auth/auth.controller.js";
import { authorize, type Permission } from "../auth/authorization.js";
import type {
  AuthenticatedRequest,
  AuthService,
} from "../auth/auth.service.js";

/**
 * The request-level half of the admin boundary, in one place.
 *
 * M6 established that authentication is verified by the API on every request
 * and that a cookie mutation additionally needs origin, `Sec-Fetch-Site`, and
 * a session-bound CSRF token. M7 implemented that once, inside its controller.
 * M8 adds a second admin controller, and two copies of a security check are
 * two things that can drift — the second copy is where the `Vary: Cookie`
 * header, or the recent-auth branch, quietly goes missing.
 *
 * So the rules live here and both controllers hold one of these. It is a plain
 * class rather than a Nest provider or a base class: the controllers already
 * receive the auth service and config by injection, and passing them onward is
 * less machinery than a second injection graph or an inheritance chain that
 * Nest has to be taught about.
 */
export class AdminRequestBoundary {
  public constructor(
    private readonly auth: AuthService,
    private readonly config: AuthRuntimeConfig
  ) {}

  /** Authenticated read. Throws the wire-shaped error, never a bare 500. */
  async require(
    request: FastifyRequest,
    permission: Permission
  ): Promise<AuthenticatedRequest> {
    const authenticated = await this.auth.authenticate(
      this.sessionCookie(request)
    );
    if (authenticated === null) {
      throw this.fail("AUTHENTICATION_REQUIRED", randomUUID());
    }
    this.allowed(authenticated, permission);
    return authenticated;
  }

  /**
   * Authenticated mutation.
   *
   * The CSRF check runs *after* authentication deliberately: a failed CSRF
   * check on an unauthenticated request would tell an attacker their forged
   * cookie was at least recognised.
   */
  async requireMutation(
    request: FastifyRequest,
    permission: Permission
  ): Promise<AuthenticatedRequest> {
    const authenticated = await this.require(request, permission);
    const token = request.headers[CSRF_HEADER_NAME];
    if (
      !authorizeCookieMutation({
        origin: request.headers.origin,
        expectedOrigin: this.config.origin,
        secFetchSite: header(request, "sec-fetch-site"),
        csrfToken: typeof token === "string" ? token : undefined,
        csrfSecret: this.config.csrfSecret,
        csrfBindingHash: authenticated.session.csrfBindingHash,
        session: authenticated.session,
      })
    ) {
      throw this.fail("CSRF_FAILED", randomUUID());
    }
    return authenticated;
  }

  allowed(authenticated: AuthenticatedRequest, permission: Permission): void {
    const decision = authorize(authenticated, permission);
    if (!decision.allowed) {
      throw this.fail(
        "FORBIDDEN",
        randomUUID(),
        decision.reason === "recent-auth-required"
          ? { reauthentication: ["required"] }
          : {}
      );
    }
  }

  id(value: string, requestId: string): string {
    const result = resourceIdSchema.safeParse(value);
    if (!result.success) {
      throw this.fail("VALIDATION_FAILED", requestId, {
        id: ["Invalid resource identifier."],
      });
    }
    return result.data;
  }

  locale(value: string, requestId: string): "en" | "fa" {
    if (value !== "en" && value !== "fa") {
      throw this.fail("VALIDATION_FAILED", requestId, {
        locale: ["Locale must be en or fa."],
      });
    }
    return value;
  }

  ifMatch(request: FastifyRequest, requestId: string): number {
    const value = request.headers["if-match"];
    const raw =
      typeof value === "string" ? value.replaceAll('"', "").trim() : "";
    if (!/^\d+$/.test(raw)) {
      throw this.fail("VALIDATION_FAILED", requestId, {
        "if-match": ["A non-negative record version is required."],
      });
    }
    const version = Number(raw);
    if (!Number.isSafeInteger(version)) {
      throw this.fail("VALIDATION_FAILED", requestId, {
        "if-match": ["A valid record version is required."],
      });
    }
    return version;
  }

  sessionCookie(request: FastifyRequest): string | undefined {
    const raw = request.headers.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === "__Host-portfolio_session" || name === "portfolio_session") {
        return decodeURIComponent(rest.join("="));
      }
    }
    return undefined;
  }

  /**
   * Admin responses are never cached, anywhere.
   *
   * `Vary: Cookie` is not decoration next to `no-store`: a shared cache that
   * ignores one may still honour the other, and an admin page served to the
   * wrong session is the failure this pair exists to make impossible.
   */
  noStore(reply: FastifyReply): void {
    void reply.header("Cache-Control", "private, no-store");
    void reply.header("Vary", "Cookie");
  }

  fail(
    code: ErrorCode,
    requestId: string,
    fields: FieldErrors = {}
  ): HttpException {
    return new HttpException(
      buildErrorBody(code, requestId, fields),
      ERROR_STATUS[code]
    );
  }
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}
