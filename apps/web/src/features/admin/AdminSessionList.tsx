"use client";

import type { SessionSummary } from "@portfolio/contracts/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  adminRequest,
  AdminRequestError,
  describeAdminError,
} from "./admin-client";
import { formatUtc } from "./format";
import { reauthenticate } from "./reauthenticate";

/**
 * ADMIN-002's session list.
 *
 * What is shown is deliberately coarse: a label like "Firefox on Windows", and
 * three timestamps. No token, no IP address, no full user-agent string. That
 * is enough to recognize "that is my laptop" or "that is not me", and a list
 * that reported exact IPs would turn one compromised admin account into a
 * location history of the owner.
 *
 * The rows come from the server on first render and are re-fetched by
 * `router.refresh()` after every change, so the list can never show a session
 * that the server has already revoked.
 */
export default function AdminSessionList({
  sessions,
}: {
  readonly sessions: readonly SessionSummary[];
}): React.JSX.Element {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string): Promise<void> {
    if (pendingId !== null) return;
    setPendingId(id);
    setError(null);

    try {
      await revokeOnce(id);
    } catch (caught) {
      // Revoking *another* session is a session-wide action, so the server
      // refuses it outside the recent-auth window and says so in the error's
      // fields. Prompting for the passkey and retrying once is the whole
      // interaction — asking the owner to find the re-authenticate button
      // themselves would be a worse version of the same two steps.
      if (caught instanceof AdminRequestError && caught.needsReauthentication) {
        try {
          await reauthenticate();
          await revokeOnce(id);
        } catch (retried) {
          setError(revocationErrorMessage(retried));
          setPendingId(null);
          return;
        }
      } else {
        setError(revocationErrorMessage(caught));
        setPendingId(null);
        return;
      }
    }

    setPendingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <p
        role="status"
        aria-live="polite"
        data-testid="admin-sessions-status"
        className={
          error === null ? "text-text-muted text-sm" : "text-danger text-sm"
        }
      >
        {error ??
          `${sessions.length} active session${sessions.length === 1 ? "" : "s"}.`}
      </p>

      <ul className="flex flex-col gap-3" data-testid="admin-session-list">
        {sessions.map((session) => (
          <li
            key={session.id}
            data-testid="admin-session-row"
            data-current={session.current ? "true" : "false"}
            className="border-border flex flex-col gap-2 border p-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex flex-col gap-1">
              <span className="text-base">
                {session.client}
                {session.current ? (
                  <span className="text-accent ml-2 text-sm">
                    (this session)
                  </span>
                ) : null}
              </span>
              <span className="text-text-muted text-sm">
                Signed in {formatUtc(session.createdAt)} · last seen{" "}
                {formatUtc(session.lastSeenAt)} · expires{" "}
                {formatUtc(session.expiresAt)}
              </span>
            </div>

            {session.current ? null : (
              <button
                type="button"
                onClick={() => void revoke(session.id)}
                disabled={pendingId !== null}
                data-testid="admin-revoke-session"
                className="border-border text-danger border p-2 text-sm disabled:opacity-60"
              >
                {pendingId === session.id ? "Revoking…" : "Revoke"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function revokeOnce(id: string): Promise<void> {
  await adminRequest(`/auth/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    mutation: true,
  });
}

function revocationErrorMessage(caught: unknown): string {
  if (caught instanceof Error && caught.name === "NotAllowedError") {
    return "The passkey prompt was dismissed. The session was not revoked.";
  }
  return describeAdminError(caught);
}
