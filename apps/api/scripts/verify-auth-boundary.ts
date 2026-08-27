/**
 * M6 exit-gate verification: the admin boundary, against a running API.
 *
 * Real HTTP, real PostgreSQL, real Argon2, and real ES256 assertions from the
 * software authenticator in `software-authenticator.ts`. Nothing about the
 * cryptography is stubbed — a login here is a login, and every refusal below
 * is the shipped code refusing.
 *
 *   DATABASE_URL=... API_ORIGIN=... WEB_ORIGIN=... \
 *   pnpm --filter @portfolio/api verify:auth
 */

import { hashPassword, recoveryCodeHash } from "@portfolio/auth-core";
import { createDatabaseClient, type Database } from "@portfolio/database";

import {
  createAssertion,
  createRegistration,
  createSoftwareCredential,
} from "./software-authenticator.js";

if (!process.argv.includes("--apply")) {
  throw new Error(
    "Refusing to run the destructive auth verification without --apply."
  );
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const API = required("API_ORIGIN").replace(/\/$/, "");
const ORIGIN = required("WEB_ORIGIN").replace(/\/$/, "");
const RP_ID = required("WEBAUTHN_RP_ID");
const RECOVERY_SECRET = required("RECOVERY_SECRET");
const database: Database = createDatabaseClient({
  connectionString: required("DATABASE_URL"),
});

let checks = 0;
let failures = 0;
const section = (title: string): void =>
  void process.stdout.write(`\n## ${title}\n`);
const check = (label: string, ok: boolean, detail = ""): void => {
  checks += 1;
  if (!ok) failures += 1;
  process.stdout.write(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail === "" ? "" : `  — ${detail}`}\n`
  );
};

interface Response {
  readonly status: number;
  readonly headers: Headers;
  readonly body: string;
  readonly cookies: readonly string[];
}

async function call(
  path: string,
  init: {
    readonly method?: string;
    readonly body?: unknown;
    readonly cookie?: string;
    readonly origin?: string | null;
    readonly csrf?: string;
  } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  headers["sec-fetch-site"] = "same-origin";
  if (init.cookie) headers.cookie = init.cookie;
  if (init.csrf) headers["x-csrf-token"] = init.csrf;
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
    cookies: response.headers.getSetCookie?.() ?? [],
  };
}

const cookieValue = (
  cookies: readonly string[],
  name: string
): string | null => {
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const [key, ...rest] = (pair ?? "").split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
};

const OWNER_ID = "m6ownerproofaccount00000";
const EMAIL = "m6-owner@example.invalid";
const PASSWORD = "correct horse battery staple";
const RECOVERY_CODE = "abcde-fghjk-mnpqr-stuvw";
const credential = createSoftwareCredential();
let counter = 0;

/** Exactly what the provisioning command plus a first enrolment would leave. */
async function provision(): Promise<void> {
  await database.session.deleteMany({ where: { userId: OWNER_ID } });
  await database.recoveryCode.deleteMany({ where: { userId: OWNER_ID } });
  await database.webAuthnCredential.deleteMany({ where: { userId: OWNER_ID } });
  await database.auditEvent.deleteMany({ where: { actorId: OWNER_ID } });
  await database.user.deleteMany({ where: { id: OWNER_ID } });
  await database.user.create({
    data: {
      id: OWNER_ID,
      email: EMAIL,
      displayName: "M6 proof owner",
      role: "OWNER",
      status: "ACTIVE",
      passwordHash: await hashPassword(PASSWORD),
      passwordChangedAt: new Date(),
    },
  });
  await database.webAuthnCredential.create({
    data: {
      userId: OWNER_ID,
      credentialId: credential.credentialId,
      publicKey: credential.cosePublicKey,
      counter: BigInt(0),
      transports: ["internal"],
      label: "Proof authenticator",
    },
  });
  await database.recoveryCode.create({
    data: {
      userId: OWNER_ID,
      codeHash: recoveryCodeHash(RECOVERY_SECRET, RECOVERY_CODE)!,
    },
  });
}

async function login(password = PASSWORD): Promise<Response> {
  const started = await call("/api/v1/auth/login/password", {
    body: { email: EMAIL, password },
  });
  const { challengeId } = JSON.parse(started.body).data;
  const options = await call("/api/v1/auth/webauthn/options", {
    body: { challengeId },
  });
  const challenge = JSON.parse(options.body).data.challenge;
  counter += 1;
  return call("/api/v1/auth/webauthn/verify", {
    body: {
      challengeId,
      assertion: createAssertion({
        credential,
        challenge,
        origin: ORIGIN,
        rpId: RP_ID,
        counter,
      }),
    },
  });
}

try {
  await provision();

  section("1. The boundary is closed by default");
  const anonymous = await call("/api/v1/auth/session");
  check(
    "an unauthenticated session read is refused",
    anonymous.status === 401 &&
      JSON.parse(anonymous.body).error.code === "AUTHENTICATION_REQUIRED",
    `HTTP ${anonymous.status}`
  );
  const forged = await call("/api/v1/auth/session", {
    cookie: "portfolio_session=not-a-real-token",
  });
  check("a forged session cookie is refused", forged.status === 401);

  section("2. Two factors, and only two factors, produce a session");
  const passwordOnly = await call("/api/v1/auth/login/password", {
    body: { email: EMAIL, password: PASSWORD },
  });
  check(
    "the password step sets no session cookie",
    passwordOnly.status === 200 &&
      cookieValue(passwordOnly.cookies, "portfolio_session") === null,
    `${passwordOnly.cookies.length} cookie(s)`
  );
  check(
    "auth responses are never cacheable",
    passwordOnly.headers.get("cache-control") === "private, no-store",
    passwordOnly.headers.get("cache-control") ?? "(absent)"
  );

  const wrong = await call("/api/v1/auth/login/password", {
    body: { email: EMAIL, password: "not the password" },
  });
  const unknown = await call("/api/v1/auth/login/password", {
    body: { email: "nobody@example.invalid", password: "not the password" },
  });
  check(
    "a wrong password and an unknown account answer identically",
    wrong.status === unknown.status &&
      Object.keys(JSON.parse(wrong.body).data).sort().join() ===
        Object.keys(JSON.parse(unknown.body).data).sort().join(),
    `both HTTP ${wrong.status}`
  );

  const authenticated = await login();
  const sessionCookie = cookieValue(authenticated.cookies, "portfolio_session");
  const csrfToken = cookieValue(authenticated.cookies, "portfolio_csrf");
  check(
    "a real assertion over a live challenge issues a session",
    authenticated.status === 200 &&
      sessionCookie !== null &&
      csrfToken !== null,
    `HTTP ${authenticated.status}`
  );
  const cookie = `portfolio_session=${encodeURIComponent(sessionCookie ?? "")}`;

  const actor = await call("/api/v1/auth/session", { cookie });
  check(
    "the session describes the actor and nothing more",
    actor.status === 200 &&
      JSON.parse(actor.body).data.role === "OWNER" &&
      !actor.body.includes(sessionCookie ?? "@@") &&
      !actor.body.includes("passwordHash"),
    `HTTP ${actor.status}`
  );

  section("3. Assertions cannot be replayed or borrowed");
  const started = await call("/api/v1/auth/login/password", {
    body: { email: EMAIL, password: PASSWORD },
  });
  const replayId = JSON.parse(started.body).data.challengeId;
  const replayOptions = await call("/api/v1/auth/webauthn/options", {
    body: { challengeId: replayId },
  });
  counter += 1;
  const assertion = createAssertion({
    credential,
    challenge: JSON.parse(replayOptions.body).data.challenge,
    origin: ORIGIN,
    rpId: RP_ID,
    counter,
  });
  const first = await call("/api/v1/auth/webauthn/verify", {
    body: { challengeId: replayId, assertion },
  });
  const second = await call("/api/v1/auth/webauthn/verify", {
    body: { challengeId: replayId, assertion },
  });
  check(
    "the same assertion is accepted once and refused on replay",
    first.status === 200 && second.status === 401,
    `${first.status} then ${second.status}`
  );

  const badPassword = await call("/api/v1/auth/login/password", {
    body: { email: EMAIL, password: "not the password" },
  });
  const badChallengeId = JSON.parse(badPassword.body).data.challengeId;
  const badOptions = await call("/api/v1/auth/webauthn/options", {
    body: { challengeId: badChallengeId },
  });
  counter += 1;
  const orphan = await call("/api/v1/auth/webauthn/verify", {
    body: {
      challengeId: badChallengeId,
      assertion: createAssertion({
        credential,
        challenge: JSON.parse(badOptions.body).data.challenge,
        origin: ORIGIN,
        rpId: RP_ID,
        counter,
      }),
    },
  });
  check(
    "a valid passkey cannot rescue a failed password step",
    orphan.status === 401,
    `HTTP ${orphan.status}`
  );

  section("4. Cross-origin and CSRF defences");
  const crossOrigin = await call("/api/v1/auth/login/password", {
    body: { email: EMAIL, password: PASSWORD },
    origin: "https://evil.example.invalid",
  });
  check(
    "a login from another origin is refused",
    crossOrigin.status === 403,
    `HTTP ${crossOrigin.status}`
  );

  // An empty body is sent explicitly: a `POST` announcing JSON with no body at
  // all is a parse error, and a 400 would look like a CSRF refusal without
  // being one.
  const noCsrf = await call("/api/v1/auth/logout", {
    method: "POST",
    cookie,
    body: {},
  });
  check(
    "a cookie-authenticated mutation without a CSRF token is refused",
    noCsrf.status === 403,
    `HTTP ${noCsrf.status}`
  );
  const wrongCsrf = await call("/api/v1/auth/logout", {
    method: "POST",
    cookie,
    body: {},
    csrf: "x".repeat(43),
  });
  check(
    "a cookie-authenticated mutation with the wrong CSRF token is refused",
    wrongCsrf.status === 403,
    `HTTP ${wrongCsrf.status}`
  );

  section("5. Sessions end when they are told to");
  const sessions = await call("/api/v1/auth/sessions", { cookie });
  const listed = JSON.parse(sessions.body).data;
  check(
    "the session list shows a coarse client and never a raw token",
    sessions.status === 200 &&
      Array.isArray(listed) &&
      listed.some((entry: { current: boolean }) => entry.current) &&
      !sessions.body.includes(sessionCookie ?? "@@"),
    `${listed.length} session(s)`
  );

  const loggedOut = await call("/api/v1/auth/logout", {
    method: "POST",
    cookie,
    body: {},
    csrf: csrfToken ?? "",
  });
  const afterLogout = await call("/api/v1/auth/session", { cookie });
  check(
    "logout revokes the session and the cookie stops working immediately",
    loggedOut.status === 204 && afterLogout.status === 401,
    `${loggedOut.status} then ${afterLogout.status}`
  );

  section("6. Recovery");
  const before = await login();
  const beforeCookie = `portfolio_session=${encodeURIComponent(
    cookieValue(before.cookies, "portfolio_session") ?? ""
  )}`;
  const recovered = await call("/api/v1/auth/recovery/verify", {
    body: { email: EMAIL, code: RECOVERY_CODE },
  });
  const displaced = await call("/api/v1/auth/session", {
    cookie: beforeCookie,
  });
  check(
    "a recovery code authenticates and revokes every existing session",
    recovered.status === 200 && displaced.status === 401,
    `${recovered.status}, displaced ${displaced.status}`
  );
  const reused = await call("/api/v1/auth/recovery/verify", {
    body: { email: EMAIL, code: RECOVERY_CODE },
  });
  check(
    "the same recovery code cannot be used twice",
    reused.status === 401,
    `HTTP ${reused.status}`
  );

  section("7. The audit trail");
  const events = await database.auditEvent.findMany({
    where: { actorId: OWNER_ID },
    select: { eventType: true },
  });
  const types = new Set(events.map((event) => event.eventType));
  check(
    "the security events SECURITY.md §13 names are recorded",
    ["auth.login", "auth.logout", "auth.recovery.used"].every((type) =>
      types.has(type)
    ),
    [...types].sort().join(", ")
  );
  // Read the rows and look at them, rather than asking PostgreSQL a JSON-path
  // question: the assertion is "nothing sensitive appears anywhere in here",
  // and a path query can only ask about paths someone thought to name.
  const stored = await database.auditEvent.findMany({
    where: { actorId: OWNER_ID },
    select: { metadata: true },
  });
  const serialized = JSON.stringify(stored);
  check(
    "no audit record carries a password, a code, or a token",
    !serialized.includes(PASSWORD) &&
      !serialized.includes(RECOVERY_CODE) &&
      !serialized.includes(credential.credentialId),
    `${stored.length} record(s) inspected`
  );

  section("8. Enrolling a second passkey");
  // A fresh login is a recent authentication, which is what enrolment needs.
  const fresh = await login();
  const freshCookie = `portfolio_session=${encodeURIComponent(
    cookieValue(fresh.cookies, "portfolio_session") ?? ""
  )}`;
  const freshCsrf = cookieValue(fresh.cookies, "portfolio_csrf") ?? "";

  const noCsrfEnrol = await call("/api/v1/auth/webauthn/enroll/options", {
    body: {},
    cookie: freshCookie,
  });
  check(
    "enrolment cannot be started without a CSRF token",
    noCsrfEnrol.status === 403,
    `HTTP ${noCsrfEnrol.status}`
  );

  const enrolOptions = await call("/api/v1/auth/webauthn/enroll/options", {
    body: {},
    cookie: freshCookie,
    csrf: freshCsrf,
  });
  const enrolData = JSON.parse(enrolOptions.body).data;
  check(
    "the options exclude the passkey already registered",
    enrolOptions.status === 200 &&
      Array.isArray(enrolData.excludeCredentials) &&
      enrolData.excludeCredentials.some(
        (entry: { id: string }) => entry.id === credential.credentialId
      ),
    `HTTP ${enrolOptions.status}`
  );

  const secondKey = createSoftwareCredential();
  const enrolled = await call("/api/v1/auth/webauthn/enroll", {
    body: {
      challengeId: enrolData.challengeId,
      label: "Second authenticator",
      registration: createRegistration({
        credential: secondKey,
        challenge: enrolData.challenge,
        origin: ORIGIN,
        rpId: RP_ID,
      }),
    },
    cookie: freshCookie,
    csrf: freshCsrf,
  });
  check(
    "a verified registration is stored as a usable credential",
    enrolled.status === 201 &&
      JSON.parse(enrolled.body).data.credentialId === secondKey.credentialId,
    `HTTP ${enrolled.status}`
  );

  const storedCredential = await database.webAuthnCredential.findUnique({
    where: { credentialId: secondKey.credentialId },
    select: { userId: true, label: true },
  });
  check(
    "the stored credential belongs to the enrolling owner and carries its label",
    storedCredential?.userId === OWNER_ID &&
      storedCredential?.label === "Second authenticator",
    storedCredential?.label ?? "(absent)"
  );

  section("9. The new passkey authenticates on its own");
  const withSecond = await (async () => {
    const started = await call("/api/v1/auth/login/password", {
      body: { email: EMAIL, password: PASSWORD },
    });
    const { challengeId } = JSON.parse(started.body).data;
    const options = await call("/api/v1/auth/webauthn/options", {
      body: { challengeId },
    });
    return call("/api/v1/auth/webauthn/verify", {
      body: {
        challengeId,
        assertion: createAssertion({
          credential: secondKey,
          challenge: JSON.parse(options.body).data.challenge,
          origin: ORIGIN,
          rpId: RP_ID,
          counter: 1,
        }),
      },
    });
  })();
  check(
    "the newly enrolled passkey completes a login",
    withSecond.status === 200 &&
      cookieValue(withSecond.cookies, "portfolio_session") !== null,
    `HTTP ${withSecond.status}`
  );

  // Deliberately last: it deliberately fills the throttle buckets, and every
  // check above needs a login that is not being refused for that reason.
  section("10. Repeated failures are throttled");
  let throttled = 0;
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const response = await call("/api/v1/auth/login/password", {
      body: { email: EMAIL, password: `wrong-${attempt}` },
    });
    if (response.status === 429) throttled += 1;
  }
  check(
    "repeated failures are progressively throttled",
    throttled > 0,
    `${throttled} of 9 attempts refused with 429`
  );

  process.stdout.write(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} — ${checks} checks\n`
  );
} finally {
  await database.$disconnect();
}

if (failures > 0) process.exitCode = 1;
