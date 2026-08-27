import { startAuthentication } from "@simplewebauthn/browser";

import { adminRequest } from "./admin-client";

/**
 * Prove identity again, inside the recent-auth window.
 *
 * Session-wide and destructive actions require an authentication that happened
 * in the last few minutes (SECURITY.md §3). This is the same passkey step as
 * login, with two differences that matter: it runs against an already
 * authenticated session, and verifying it **rotates** that session — the
 * previous token stops working the moment the new one is issued, so proving
 * yourself again also invalidates a copy of the cookie somebody else might
 * hold.
 *
 * Recency is measured from the session's own `createdAt`, and a token is
 * issued at login and here and nowhere else. There is no separate
 * "last authenticated" value that could drift away from the session it
 * describes.
 */
export async function reauthenticate(): Promise<void> {
  const challenge = await adminRequest<{ challengeId: string }>(
    "/auth/reauthenticate",
    { method: "POST", mutation: true }
  );

  const options = await adminRequest<
    Parameters<typeof startAuthentication>[0]["optionsJSON"]
  >("/auth/webauthn/options", {
    method: "POST",
    body: { challengeId: challenge.challengeId },
  });

  const assertion = await startAuthentication({ optionsJSON: options });

  await adminRequest("/auth/webauthn/verify", {
    method: "POST",
    body: { challengeId: challenge.challengeId, assertion },
  });
}
