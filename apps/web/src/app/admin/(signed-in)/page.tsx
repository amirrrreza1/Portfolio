import {
  RECENT_AUTH_WINDOW_MINUTES,
  SESSION_ABSOLUTE_TIMEOUT_HOURS,
  SESSION_IDLE_TIMEOUT_MINUTES,
} from "@portfolio/contracts/auth";

import AdminEnrolPasskey from "@/features/admin/AdminEnrolPasskey";
import AdminDashboard from "@/features/admin/AdminDashboard";
import AdminContentWorkspace from "@/features/admin/AdminContentWorkspace";
import AdminSessionList from "@/features/admin/AdminSessionList";
import { formatUtc } from "@/features/admin/format";
import { listAdminSessions, requireAdminActor } from "@/server/admin-session";

/**
 * The admin shell.
 *
 * M6 established the authenticated boundary; M7 fills that boundary with the
 * complete non-blog portfolio workspace while security and content controls
 * continue to share the same owner shell.
 */
export default async function AdminHomePage(): Promise<React.JSX.Element> {
  // Asked again here, not inherited from the layout. See admin-session.ts.
  const actor = await requireAdminActor();
  const sessions = await listAdminSessions();

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">This session</h2>
        <dl className="border-border grid grid-cols-1 gap-3 border p-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-text-muted text-sm">Role</dt>
            <dd className="text-base" data-testid="admin-role">
              {actor.role}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-text-muted text-sm">Expires</dt>
            <dd className="text-base">{formatUtc(actor.expiresAt)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-text-muted text-sm">Recent authentication</dt>
            <dd className="text-base" data-testid="admin-recent-auth">
              {actor.recentlyAuthenticated
                ? `Active · ${RECENT_AUTH_WINDOW_MINUTES} minutes from sign-in`
                : "Expired · a privileged action will ask for your passkey"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-text-muted text-sm">Session policy</dt>
            <dd className="text-base">
              {SESSION_IDLE_TIMEOUT_MINUTES} minutes idle ·{" "}
              {SESSION_ABSOLUTE_TIMEOUT_HOURS} hours absolute
            </dd>
          </div>
        </dl>
      </section>

      <AdminContentWorkspace />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Active sessions</h2>
          <p className="text-text-muted text-sm">
            Revoking another session takes effect on its next request. It needs
            a passkey confirmation if you have not signed in recently.
          </p>
        </div>
        <AdminSessionList sessions={sessions} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Passkeys</h2>
          <p className="text-text-muted text-sm">
            Register the device you will sign in with. An account that has only
            recovery codes left needs one of these before the codes run out.
          </p>
        </div>
        <AdminEnrolPasskey />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Content health</h2>
          <p className="text-text-muted text-sm">
            Drafts, delivery state, recent edits, and failed security events.
            Content bodies and credentials are never shown here.
          </p>
        </div>
        <AdminDashboard />
      </section>
    </div>
  );
}
