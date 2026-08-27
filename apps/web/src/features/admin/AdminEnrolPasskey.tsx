"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  adminRequest,
  AdminRequestError,
  describeAdminError,
} from "./admin-client";
import { reauthenticate } from "./reauthenticate";

/**
 * Registering a passkey.
 *
 * This is the surface that closes the bootstrap loop, and without it the panel
 * would have a hole exactly the shape of a locked-out owner: provisioning
 * issues recovery codes, a code buys a session — and then there would be no
 * way to register the passkey that every subsequent sign-in requires. It is
 * also the second half of the credential-revocation drill, where a new key is
 * enrolled before the compromised one stops being the only one.
 *
 * There is no unauthenticated registration window and no separate enrolment
 * token. Enrolment is an authenticated, recent-auth-gated action on an
 * existing session, which is why a stolen link cannot add a key to someone
 * else's account.
 */

type RegistrationOptions = Parameters<
  typeof startRegistration
>[0]["optionsJSON"] & { readonly challengeId: string };

export default function AdminEnrolPasskey(): React.JSX.Element {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setFailed(false);

    try {
      await enrol(label);
    } catch (caught) {
      if (caught instanceof AdminRequestError && caught.needsReauthentication) {
        try {
          await reauthenticate();
          await enrol(label);
        } catch (retried) {
          setMessage(enrolmentErrorMessage(retried));
          setFailed(true);
          setBusy(false);
          return;
        }
      } else {
        setMessage(enrolmentErrorMessage(caught));
        setFailed(true);
        setBusy(false);
        return;
      }
    }

    setLabel("");
    setMessage("Passkey registered.");
    setBusy(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="passkey-label" className="text-sm">
          Name this device
        </label>
        <input
          id="passkey-label"
          name="label"
          type="text"
          required
          maxLength={64}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={busy}
          placeholder="Work laptop"
          className="border-border bg-surface text-text border p-2.5 text-base outline-none"
        />
      </div>

      <p
        role="status"
        aria-live="polite"
        data-testid="admin-enrol-status"
        className={failed ? "text-danger text-sm" : "text-text-muted text-sm"}
      >
        {message ?? "You will be asked to confirm on the device itself."}
      </p>

      <button
        type="submit"
        disabled={busy}
        data-testid="admin-enrol-passkey"
        className="border-border bg-surface text-text w-fit border p-2.5 text-base disabled:opacity-60"
      >
        {busy ? "Waiting for the device…" : "Add a passkey"}
      </button>
    </form>
  );
}

async function enrol(label: string): Promise<void> {
  const options = await adminRequest<RegistrationOptions>(
    "/auth/webauthn/enroll/options",
    { method: "POST", mutation: true }
  );

  // The server already excludes credentials this account has registered, so an
  // authenticator that is enrolled refuses rather than silently creating a
  // second key for the same device.
  const registration = await startRegistration({ optionsJSON: options });

  await adminRequest("/auth/webauthn/enroll", {
    method: "POST",
    mutation: true,
    body: { challengeId: options.challengeId, label, registration },
  });
}

function enrolmentErrorMessage(caught: unknown): string {
  if (caught instanceof Error && caught.name === "InvalidStateError") {
    return "That device already has a passkey for this account.";
  }
  if (caught instanceof Error && caught.name === "NotAllowedError") {
    return "The device prompt was dismissed or timed out. Nothing was registered.";
  }
  // `SecurityError` is the browser refusing the *request*, before any device
  // is asked — almost always because the relying-party ID does not match the
  // origin the page was served from. Reporting it as a generic failure sent a
  // real operator hunting through the authenticator instead of the one
  // environment variable that was wrong.
  if (caught instanceof Error && caught.name === "SecurityError") {
    return "This browser refused the request. The site's passkey settings do not match its address.";
  }
  if (caught instanceof Error && caught.name === "NotSupportedError") {
    return "This browser or device cannot register a passkey.";
  }
  return describeAdminError(caught);
}
