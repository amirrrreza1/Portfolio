import type { BrowserContext, CDPSession, Page } from "@playwright/test";

/**
 * The web origin under test.
 *
 * It must equal the API's `WEBAUTHN_ORIGIN` exactly. WebAuthn binds an
 * assertion to the origin that requested it and the API checks that binding,
 * so `localhost` here against `127.0.0.1` there is not a near miss — it is a
 * refused signature.
 *
 * It must also be a **hostname**, not an IP literal. A relying-party ID has to
 * be a domain, and Chrome rejects `rp.id: "127.0.0.1"` with a `SecurityError`
 * before it ever reaches an authenticator. The software authenticator the API
 * tests against does not care, which is exactly why this run exists.
 */
export const adminBaseUrl =
  process.env.E2E_ADMIN_BASE_URL ?? "http://localhost:3310";

/** The session cookie's name over plain HTTP, where `__Host-` is not legal. */
export const SESSION_COOKIE = "portfolio_session";

export function ownerCredentials(): {
  readonly email: string;
  readonly password: string;
  readonly recoveryCode: string;
} {
  const email = process.env.E2E_OWNER_EMAIL;
  const password = process.env.E2E_OWNER_PASSWORD;
  const recoveryCode = process.env.E2E_RECOVERY_CODE;
  if (!email || !password || !recoveryCode) {
    throw new Error(
      "E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, and E2E_RECOVERY_CODE are required."
    );
  }
  return { email, password, recoveryCode };
}

/**
 * One passkey, carried between tests.
 *
 * A virtual authenticator is attached to a browser context and dies with it,
 * so a credential enrolled in one test is gone by the next. Re-enrolling per
 * test would work, but it would also mean no test ever signs in with a key
 * that was registered *earlier* — and "the passkey you enrolled yesterday
 * still works" is precisely the property a login flow has to have. Exporting
 * the credential from the authenticator that created it and re-adding it to
 * each new one keeps the key stable across the file while leaving every
 * signature real.
 */
export interface StoredCredential {
  readonly credentialId: string;
  readonly isResidentCredential: boolean;
  readonly privateKey: string;
  readonly rpId?: string;
  readonly userHandle?: string;
  readonly signCount: number;
}

let enrolled: StoredCredential | null = null;

export function rememberCredential(credential: StoredCredential): void {
  enrolled = credential;
}

export function enrolledCredential(): StoredCredential {
  if (enrolled === null) {
    throw new Error(
      "No passkey has been enrolled yet — the bootstrap test must run first."
    );
  }
  return enrolled;
}

/**
 * A software authenticator inside Chrome.
 *
 * The API verifies real ES256 signatures — origin, RP ID, challenge freshness,
 * single use, and the signature counter — and none of that can be exercised by
 * a stub. Chrome's WebAuthn virtual authenticator is a real CTAP2
 * implementation driven over the DevTools protocol, so `navigator.credentials`
 * behaves as it does with a hardware key and the server cannot tell it is
 * talking to a test.
 *
 * `isUserVerified` matters: enrolment and assertion both require user
 * verification, and an authenticator reporting UV false is refused by the
 * server rather than failing in the browser.
 */
interface AttachedAuthenticator {
  readonly client: CDPSession;
  readonly authenticatorId: string;
}

/**
 * One authenticator per browser context, reused.
 *
 * Chrome permits exactly one `internal` virtual authenticator per environment
 * and answers a second `addVirtualAuthenticator` with a protocol error, which
 * is faithful to the hardware it is standing in for: a laptop has one platform
 * authenticator, not several. A test that signs in twice on the same context
 * therefore has to reuse the one it already attached.
 */
const attached = new WeakMap<BrowserContext, AttachedAuthenticator>();

export async function attachVirtualAuthenticator(
  page: Page,
  options: { readonly withEnrolledCredential?: boolean } = {}
): Promise<AttachedAuthenticator> {
  const context = page.context();
  let authenticator = attached.get(context);

  if (authenticator === undefined) {
    const client = await context.newCDPSession(page);
    await client.send("WebAuthn.enable", { enableUI: false });
    const { authenticatorId } = await client.send(
      "WebAuthn.addVirtualAuthenticator",
      {
        options: {
          protocol: "ctap2",
          ctap2Version: "ctap2_1",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      }
    );
    authenticator = { client, authenticatorId };
    attached.set(context, authenticator);
  }

  if (options.withEnrolledCredential === true) {
    const wanted = enrolledCredential();
    const { credentials } = await authenticator.client.send(
      "WebAuthn.getCredentials",
      { authenticatorId: authenticator.authenticatorId }
    );
    const existing = credentials.find(
      (credential) => credential.credentialId === wanted.credentialId
    );
    if (existing === undefined) {
      await authenticator.client.send("WebAuthn.addCredential", {
        authenticatorId: authenticator.authenticatorId,
        credential: wanted,
      });
    }
    // A credential already in the authenticator carries its own live counter,
    // which is ahead of the stored copy. Replacing it with the stale one would
    // reintroduce exactly the clone-detection failure `refreshCredential`
    // exists to avoid.
  }

  return authenticator;
}

/**
 * Carry the authenticator's signature counter forward.
 *
 * A real passkey's counter only ever increases, and the server stores the
 * highest value it has seen so that a *lower* one identifies a cloned
 * credential. Each test here attaches a fresh virtual authenticator seeded
 * from the stored credential, so without this the second sign-in would replay
 * the counter from enrolment — the server would correctly read that as a clone
 * and refuse it. Re-reading the credential after each successful assertion
 * keeps the harness honest rather than turning the clone check off.
 */
export async function refreshCredential(
  client: CDPSession,
  authenticatorId: string
): Promise<void> {
  const { credentials } = await client.send("WebAuthn.getCredentials", {
    authenticatorId,
  });
  if (credentials[0] !== undefined) {
    rememberCredential(credentials[0] as StoredCredential);
  }
}

export async function sessionCookieValue(
  context: BrowserContext
): Promise<string | undefined> {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value;
}
