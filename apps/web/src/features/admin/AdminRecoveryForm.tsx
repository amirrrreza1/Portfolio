"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { adminRequest, describeAdminError } from "./admin-client";

/**
 * Signing in with a recovery code, when the passkey is gone.
 *
 * This is the only path that produces a session without an assertion, which is
 * why the server treats it as the most dangerous one on the surface: a
 * stricter throttle than login, a single-use hashed code, a sweep of every
 * other session, and a security notification to the owner. None of that is
 * this component's job — it exists so the owner is not locked out, and so the
 * page that lets them back in is deliberately plain.
 *
 * The code input accepts the hyphenated form people read off paper. The
 * contract strips separators before hashing, so a transcription with or
 * without them is the same code.
 */
export default function AdminRecoveryForm(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      await adminRequest("/auth/recovery/verify", {
        method: "POST",
        body: { email, code },
      });
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(describeAdminError(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="recovery-email" className="text-sm">
          Email
        </label>
        <input
          id="recovery-email"
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
        <label htmlFor="recovery-code" className="text-sm">
          Recovery code
        </label>
        <input
          id="recovery-code"
          name="code"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          spellCheck={false}
          autoCapitalize="none"
          placeholder="xxxxx-xxxxx-xxxxx-xxxxx"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={busy}
          className="border-border bg-surface text-text h-10 border px-3 py-0 text-base outline-none"
        />
      </div>

      <p
        role="status"
        aria-live="polite"
        data-testid="admin-recovery-status"
        className={
          error === null ? "text-text-muted text-sm" : "text-danger text-sm"
        }
      >
        {error ??
          "Using a code signs every other session out and emails the owner."}
      </p>

      <button
        type="submit"
        disabled={busy}
        className="border-border bg-surface text-text flex h-10 items-center justify-center border px-3 py-0 text-base leading-none disabled:opacity-60"
      >
        {busy ? "Checking…" : "Use recovery code"}
      </button>

      <Link
        href="/admin/login"
        className="text-text-muted text-sm underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </form>
  );
}
