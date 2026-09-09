"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

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
export default function SignOutButton({
  compact = false,
}: {
  readonly compact?: boolean;
}): React.JSX.Element {
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
    <div className={`flex flex-col gap-1 ${compact ? "items-end" : "w-full"}`}>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        data-testid={compact ? "admin-sign-out-mobile" : "admin-sign-out"}
        aria-label={compact ? "Sign out" : undefined}
        className={`border-border text-text hover:bg-secondary focus-visible:ring-accent flex items-center justify-center gap-2 rounded-lg border text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60 ${
          compact ? "size-9" : "min-h-10 w-full px-3"
        }`}
      >
        <LogOut aria-hidden="true" size={16} />
        {compact ? null : busy ? "Signing out…" : "Sign out"}
      </button>
      {error === null ? null : (
        <span role="status" aria-live="polite" className="text-danger text-sm">
          {error}
        </span>
      )}
    </div>
  );
}
