import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  authorizeCookieMutation,
  type IssuedSession,
} from "@portfolio/auth-core";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  enrollCredentialSchema,
  loginRequestSchema,
  recoveryRequestSchema,
  SESSION_ABSOLUTE_TIMEOUT_HOURS,
  SESSION_COOKIE_NAME,
  sessionActorSchema,
  sessionSummarySchema,
  webAuthnVerifyRequestSchema,
} from "@portfolio/contracts/auth";
import {
  buildErrorBody,
  ERROR_STATUS,
  toFieldErrors,
  type ErrorCode,
  type FieldErrors,
} from "@portfolio/contracts/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  accountThrottleKey,
  hashNetworkPrefix,
  summarizeClient,
} from "./auth.runtime.js";
import {
  AuthenticationRejectedError,
  RecentAuthenticationRequiredError,
  ThrottledError,
  type AuthenticatedRequest,
  type AuthService,
} from "./auth.service.js";

export const AUTH_SERVICE = Symbol("AUTH_SERVICE");
export const AUTH_RUNTIME_CONFIG = Symbol("AUTH_RUNTIME_CONFIG");

export interface AuthRuntimeConfig {
  readonly origin: string;
  /** Verifies a presented CSRF token against the session's binding. */
  readonly csrfSecret: string;
  /**
   * Keys the throttle buckets and the stored network-prefix hash. Separate
   * from the CSRF secret on purpose: these values are derived from
   * attacker-supplied input, and a secret used for both derivation and
   * verification is a secret used for two jobs.
   */
  readonly hashSecret: string;
  /** False only in local HTTP development; `__Host-` requires Secure. */
  readonly secureCookies: boolean;
}

const optionsRequestSchema = z
  .object({ challengeId: z.string().min(1) })
  .strict();

/**
 * The authentication surface, per API_SPEC §5.
 *
 * The controller owns exactly three things the service cannot: cookies,
 * status codes, and the CSRF/origin check that guards every cookie-
 * authenticated mutation. Everything else is delegated, so a decision about
 * *who may do what* is never made in a place that also knows about HTTP.
 *
 * Every response here is `no-store`. An auth response in a shared cache is a
 * session handed to the next person through the same proxy.
 */
@Controller("auth")
export class AuthController {
  public constructor(
    @Inject(AUTH_SERVICE) private readonly auth: AuthService,
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig
  ) {}

  @Get("csrf")
  async csrf(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<{ data: { issued: true }; meta: { requestId: string } }> {
    const authenticated = await this.require(request);
    const rotated = await this.auth.rotateCsrf(authenticated);
    this.noStore(reply);
    this.setCsrfCookie(reply, rotated.csrfToken);
    return { data: { issued: true }, meta: { requestId: randomUUID() } };
  }

  @Post("login/password")
  @HttpCode(200)
  async password(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    this.assertBrowserOrigin(request, requestId);
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        buildErrorBody(
          "VALIDATION_FAILED",
          requestId,
          toFieldErrors(parsed.error)
        )
      );
    }
    this.noStore(reply);
    return this.guarded(requestId, async () => ({
      data: await this.auth.beginPasswordLogin({
        email: parsed.data.email,
        password: parsed.data.password,
        accountKey: accountThrottleKey(
          this.config.hashSecret,
          parsed.data.email
        ),
        networkKey: this.networkKey(request),
      }),
      meta: { requestId },
    }));
  }

  @Post("webauthn/options")
  @HttpCode(200)
  async options(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    this.assertBrowserOrigin(request, requestId);
    const parsed = optionsRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {})
      );
    }
    this.noStore(reply);
    const authenticated = await this.optionalSession(request);
    return this.guarded(requestId, async () => ({
      data: await this.auth.authenticationOptions({
        challengeId: parsed.data.challengeId,
        purpose: authenticated === null ? "LOGIN" : "REAUTH",
      }),
      meta: { requestId },
    }));
  }

  @Post("webauthn/verify")
  @HttpCode(200)
  async verify(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    this.assertBrowserOrigin(request, requestId);
    const parsed = webAuthnVerifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {})
      );
    }
    this.noStore(reply);
    const existing = await this.optionalSession(request);
    return this.guarded(requestId, async () => {
      const result = await this.auth.verifyAssertion({
        challengeId: parsed.data.challengeId,
        assertion: parsed.data.assertion,
        purpose: existing === null ? "LOGIN" : "REAUTH",
        client: summarizeClient(request.headers["user-agent"]),
        ipPrefixHash: hashNetworkPrefix(this.config.hashSecret, request.ip),
        networkKey: this.networkKey(request),
      });
      // Re-authentication rotates: the previous token stops working the moment
      // the new one is issued, so a stolen cookie does not survive the owner
      // proving themselves again.
      if (existing !== null) await this.auth.logout(existing);
      this.setSessionCookies(reply, result.session);
      return { data: { authenticated: true }, meta: { requestId } };
    });
  }

  @Post("recovery/verify")
  @HttpCode(200)
  async recovery(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    this.assertBrowserOrigin(request, requestId);
    const parsed = recoveryRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {})
      );
    }
    this.noStore(reply);
    return this.guarded(requestId, async () => {
      const session = await this.auth.verifyRecovery({
        email: parsed.data.email,
        code: parsed.data.code,
        accountKey: accountThrottleKey(
          this.config.hashSecret,
          parsed.data.email
        ),
        networkKey: this.networkKey(request),
        client: summarizeClient(request.headers["user-agent"]),
        ipPrefixHash: hashNetworkPrefix(this.config.hashSecret, request.ip),
      });
      this.setSessionCookies(reply, session);
      return { data: { authenticated: true }, meta: { requestId } };
    });
  }

  @Post("webauthn/enroll/options")
  @HttpCode(200)
  async enrolOptions(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    const authenticated = await this.requireMutation(request);
    this.noStore(reply);
    return this.guarded(requestId, async () => ({
      data: await this.auth.beginEnrolment(authenticated),
      meta: { requestId },
    }));
  }

  @Post("webauthn/enroll")
  @HttpCode(201)
  async enrol(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    const authenticated = await this.requireMutation(request);
    const parsed = enrollCredentialSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        buildErrorBody(
          "VALIDATION_FAILED",
          requestId,
          toFieldErrors(parsed.error)
        )
      );
    }
    this.noStore(reply);
    return this.guarded(requestId, async () => ({
      data: await this.auth.completeEnrolment(authenticated, {
        challengeId: parsed.data.challengeId,
        label: parsed.data.label,
        registration: parsed.data.registration,
      }),
      meta: { requestId },
    }));
  }

  @Get("session")
  async session(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const authenticated = await this.require(request);
    this.noStore(reply);
    return {
      data: sessionActorSchema.parse(this.auth.describeActor(authenticated)),
      meta: { requestId: randomUUID() },
    };
  }

  @Post("reauthenticate")
  @HttpCode(200)
  async reauthenticate(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const authenticated = await this.requireMutation(request);
    this.noStore(reply);
    return {
      data: await this.auth.beginReauthentication(authenticated),
      meta: { requestId: randomUUID() },
    };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<void> {
    const authenticated = await this.requireMutation(request);
    await this.auth.logout(authenticated);
    this.noStore(reply);
    this.clearSessionCookies(reply);
  }

  @Get("sessions")
  async sessions(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const authenticated = await this.require(request);
    this.noStore(reply);
    const summaries = await this.auth.listSessions(authenticated);
    return {
      data: summaries.map((summary) => sessionSummarySchema.parse(summary)),
      meta: { requestId: randomUUID() },
    };
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  async revoke(
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<void> {
    const authenticated = await this.requireMutation(request);
    const requestId = randomUUID();
    const outcome = await this.auth.revokeSession(authenticated, id);
    this.noStore(reply);
    if (outcome === "not-found") throw this.fail("NOT_FOUND", requestId);
    if (outcome === "recent-auth-required") {
      // `FORBIDDEN` with a hint, rather than a bespoke code: the client needs
      // to know to re-authenticate, and the contract's code list is closed.
      throw this.fail("FORBIDDEN", requestId, {
        reauthentication: ["required"],
      });
    }
    if (id === authenticated.session.id) this.clearSessionCookies(reply);
  }

  // -------------------------------------------------------------------------

  /** Status comes from the code, never chosen separately at the call site. */
  private fail(
    code: ErrorCode,
    requestId: string,
    fields: FieldErrors = {}
  ): HttpException {
    return new HttpException(
      buildErrorBody(code, requestId, fields),
      ERROR_STATUS[code]
    );
  }

  /**
   * Collapses every authentication failure into one `401`.
   *
   * A throttle answers `429` because a client that is being slowed down needs
   * to know to stop, and the delay itself is not a secret. Nothing else is
   * distinguishable.
   */
  private async guarded<T>(
    requestId: string,
    run: () => Promise<T>
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ThrottledError) {
        throw this.fail("RATE_LIMITED", requestId, {
          retryAfterSeconds: [String(error.retryAfterSeconds)],
        });
      }
      if (error instanceof RecentAuthenticationRequiredError) {
        throw this.fail("FORBIDDEN", requestId, {
          reauthentication: ["required"],
        });
      }
      if (error instanceof AuthenticationRejectedError) {
        throw this.fail("AUTHENTICATION_FAILED", requestId);
      }
      throw error;
    }
  }

  private async optionalSession(
    request: FastifyRequest
  ): Promise<AuthenticatedRequest | null> {
    return this.auth.authenticate(this.sessionCookie(request));
  }

  private async require(
    request: FastifyRequest
  ): Promise<AuthenticatedRequest> {
    const authenticated = await this.optionalSession(request);
    if (authenticated === null) {
      throw this.fail("AUTHENTICATION_REQUIRED", randomUUID());
    }
    return authenticated;
  }

  /**
   * A session *plus* the full browser-mutation defence.
   *
   * `authorizeCookieMutation` checks the session, the CSRF token against this
   * session's binding, the `Origin`, and `Sec-Fetch-Site` together, because
   * each closes a hole the others leave open. Same-site is not enough: a
   * compromised sibling subdomain is same-site and still not us.
   */
  private async requireMutation(
    request: FastifyRequest
  ): Promise<AuthenticatedRequest> {
    const authenticated = await this.require(request);
    const csrfToken = request.headers[CSRF_HEADER_NAME];
    const permitted = authorizeCookieMutation({
      origin: request.headers.origin,
      expectedOrigin: this.config.origin,
      secFetchSite: header(request, "sec-fetch-site"),
      csrfToken: typeof csrfToken === "string" ? csrfToken : undefined,
      csrfSecret: this.config.csrfSecret,
      csrfBindingHash: authenticated.session.csrfBindingHash,
      session: {
        expiresAt: authenticated.session.expiresAt,
        lastSeenAt: authenticated.session.lastSeenAt,
        revokedAt: authenticated.session.revokedAt,
      },
    });
    if (!permitted) {
      throw this.fail("CSRF_FAILED", randomUUID());
    }
    return authenticated;
  }

  /**
   * Login endpoints are unauthenticated, so there is no CSRF token to check.
   * The origin check is what stands in its place (SECURITY.md §6).
   */
  private assertBrowserOrigin(
    request: FastifyRequest,
    requestId: string
  ): void {
    const origin = request.headers.origin;
    const site = header(request, "sec-fetch-site");
    if (origin !== undefined && origin !== this.config.origin) {
      throw this.fail("CSRF_FAILED", requestId);
    }
    if (site !== undefined && site !== "same-origin" && site !== "none") {
      throw this.fail("CSRF_FAILED", requestId);
    }
  }

  private sessionCookie(request: FastifyRequest): string | undefined {
    const raw = request.headers.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (
        name === SESSION_COOKIE_NAME ||
        name === legacyName(SESSION_COOKIE_NAME)
      ) {
        return decodeURIComponent(rest.join("="));
      }
    }
    return undefined;
  }

  private networkKey(request: FastifyRequest): string {
    return hashNetworkPrefix(this.config.hashSecret, request.ip) ?? "unknown";
  }

  private noStore(reply: FastifyReply): void {
    void reply.header("Cache-Control", "private, no-store");
    void reply.header("Vary", "Cookie");
  }

  private setSessionCookies(reply: FastifyReply, session: IssuedSession): void {
    this.setCookie(
      reply,
      SESSION_COOKIE_NAME,
      session.sessionToken,
      SESSION_ABSOLUTE_TIMEOUT_HOURS * 3_600,
      true
    );
    this.setCsrfCookie(reply, session.csrfToken);
  }

  /**
   * The CSRF cookie is readable by script on purpose: the page has to put its
   * value in a request header, and a header a browser will not set
   * automatically is exactly what makes the double-submit meaningful. It is
   * not a credential — the session cookie is, and that one stays `HttpOnly`.
   */
  private setCsrfCookie(reply: FastifyReply, token: string): void {
    this.setCookie(
      reply,
      CSRF_COOKIE_NAME,
      token,
      SESSION_ABSOLUTE_TIMEOUT_HOURS * 3_600,
      false
    );
  }

  private clearSessionCookies(reply: FastifyReply): void {
    this.setCookie(reply, SESSION_COOKIE_NAME, "", 0, true);
    this.setCookie(reply, CSRF_COOKIE_NAME, "", 0, false);
  }

  private setCookie(
    reply: FastifyReply,
    name: string,
    value: string,
    maxAgeSeconds: number,
    httpOnly: boolean
  ): void {
    const secure = this.config.secureCookies;
    // `__Host-` is only legal on a Secure cookie. Over plain HTTP the browser
    // would reject the whole Set-Cookie, so development uses the bare name and
    // production keeps the prefix the contract declares.
    const cookieName = secure ? name : legacyName(name);
    const attributes = [
      `${cookieName}=${encodeURIComponent(value)}`,
      "Path=/",
      "SameSite=Strict",
      `Max-Age=${maxAgeSeconds}`,
    ];
    if (httpOnly) attributes.push("HttpOnly");
    if (secure) attributes.push("Secure");
    const existing = reply.getHeader("set-cookie");
    const previous =
      existing === undefined
        ? []
        : Array.isArray(existing)
          ? existing.map(String)
          : [String(existing)];
    void reply.header("set-cookie", [...previous, attributes.join("; ")]);
  }
}

function legacyName(name: string): string {
  return name.replace(/^__Host-/, "");
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}
