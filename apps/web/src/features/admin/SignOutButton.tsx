"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminRequest, describeAdminError } from "./admin-client";

/**
 * Signing out is a server-side revocation, not a cleared cookie.
 *
 * `POST /auth/logout` marks the session record revoked and only then clears
 * the cookies. Doing it the other way round — or only in the browser — would
 * leave a token that is still valid in the database and still works for
 * anyone who copied it.
 *
 * The redirect is `replace`, so the signed-in shell is not one back-button
 * press away after the session behind it has already been destroyed.
 */
export default function SignOutButton(): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminRequest("/auth/logout", { method: "POST", mutation: true });
    } catch (caught) {
      setError(describeAdminError(caught));
      setBusy(false);
      return;
    }
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        data-testid="admin-sign-out"
        className="border-border text-text border p-2 text-sm disabled:opacity-60"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error === null ? null : (
        <span role="status" aria-live="polite" className="text-danger text-sm">
          {error}
        </span>
      )}
    </div>
  );
}
