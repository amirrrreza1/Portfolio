"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  adminRequest,
  AdminRequestError,
  describeAdminError,
} from "./admin-client";

/**
 * The two-factor sign-in, exactly as API_SPEC.md §5 orders it.
 *
 * The password step issues **no session** — it returns a short-lived challenge
 * and nothing else. That is the property this form exists to preserve: a
 * correct password alone must never produce a usable cookie, so there is no
 * intermediate state here in which the user is "partly signed in". Until the
 * assertion verifies, the browser holds a challenge id and no credential.
 *
 * The form also cannot tell a doomed flow from a real one, and neither can the
 * person watching it. A failed password step still returns a challenge bound
 * to no user, and `/auth/webauthn/options` never sends `allowCredentials`, so
 * the passkey prompt appears either way and the refusal always arrives at the
 * same step with the same message.
 */

type Phase = "credentials" | "passkey";

interface LoginChallenge {
  readonly challengeId: string;
  readonly expiresAt: string;
}

type AssertionOptions = Parameters<
  typeof startAuthentication
>[0]["optionsJSON"];

export default function AdminLoginForm(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>("credentials");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const challenge = await adminRequest<LoginChallenge>(
        "/auth/login/password",
        { method: "POST", body: { email, password } }
      );

      setPhase("passkey");
      // Cleared before the authenticator prompt, not after the flow: the
      // prompt is modal and can sit open for a long time, and there is no
      // reason for the password to stay in a React tree while it does.
      setPassword("");

      const options = await adminRequest<AssertionOptions>(
        "/auth/webauthn/options",
        { method: "POST", body: { challengeId: challenge.challengeId } }
      );

      const assertion = await startAuthentication({ optionsJSON: options });

      await adminRequest("/auth/webauthn/verify", {
        method: "POST",
        body: { challengeId: challenge.challengeId, assertion },
      });

      // `replace`, not `push`: the login page must not be reachable with the
      // back button once a session exists. `refresh` re-runs the server
      // components so the shell renders against the new session rather than a
      // cached signed-out one.
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setPhase("credentials");
      setError(loginErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="admin-email" className="text-sm">
          Email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
          className="border-border bg-surface text-text h-10 border px-3 py-0 text-base outline-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="admin-password" className="text-sm">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
          className="border-border bg-surface text-text h-10 border px-3 py-0 text-base outline-none"
        />
      </div>

      {/*
        `aria-live` rather than moving focus: the message replaces nothing and
        steals no position, so a screen-reader user still on the password field
        hears the refusal without being moved off it.
      */}
      <p
        role="status"
        aria-live="polite"
        data-testid="admin-login-status"
        className={
          error === null ? "text-text-muted text-sm" : "text-danger text-sm"
        }
      >
        {error ?? (phase === "passkey" ? "Waiting for your passkey…" : " ")}
      </p>

      <button
        type="submit"
        disabled={busy}
        className="border-border bg-surface text-text flex h-10 items-center justify-center border px-3 py-0 text-base leading-none disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <Link
        href="/admin/recovery"
        className="text-text-muted text-sm underline underline-offset-4"
      >
        Use a recovery code instead
      </Link>
    </form>
  );
}

/**
 * A cancelled authenticator prompt is not a failed sign-in.
 *
 * The browser throws `NotAllowedError` both when the person dismisses the
 * prompt and when it times out. Reporting that as "those credentials were not
 * accepted" would tell an owner their password is wrong when they merely
 * touched the wrong thing, and send them off to reset something that was never
 * broken.
 */
function loginErrorMessage(caught: unknown): string {
  if (caught instanceof AdminRequestError) return describeAdminError(caught);
  if (caught instanceof Error && caught.name === "NotAllowedError") {
    return "The passkey prompt was dismissed or timed out. Try again.";
  }
  if (caught instanceof Error && caught.name === "AbortError") {
    return "The passkey prompt was cancelled. Try again.";
  }
  // See AdminEnrolPasskey: a `SecurityError` is a relying-party/origin
  // mismatch, which is configuration rather than anything the person signing
  // in did wrong.
  if (caught instanceof Error && caught.name === "SecurityError") {
    return "This browser refused the request. The site's passkey settings do not match its address.";
  }
  return "This browser could not complete the passkey step.";
}
