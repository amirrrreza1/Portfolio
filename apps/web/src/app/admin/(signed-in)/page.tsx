import {
  RECENT_AUTH_WINDOW_MINUTES,
  SESSION_ABSOLUTE_TIMEOUT_HOURS,
  SESSION_IDLE_TIMEOUT_MINUTES,
} from "@portfolio/contracts/auth";
import { Clock3, KeyRound, ShieldCheck, UserRound } from "lucide-react";

import AdminDashboard from "@/features/admin/AdminDashboard";
import { AdminPageHeader } from "@/features/admin/AdminPage";
import { formatUtc } from "@/features/admin/format";
import { requireAdminActor } from "@/server/admin-session";

export default async function AdminHomePage(): Promise<React.JSX.Element> {
  const actor = await requireAdminActor();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <AdminPageHeader
            eyebrow="Dashboard"
            title={`Welcome back, ${actor.displayName}`}
            description="A quick view of your account and portfolio delivery. Use the sidebar to open each editing workspace."
          />
          <span className="border-success/40 bg-success/10 text-success inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
            <span className="bg-success size-1.5 rounded-full" />
            Admin session active
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewCard
            icon={UserRound}
            label="Role"
            value={actor.role}
            testId="admin-role"
          />
          <OverviewCard
            icon={Clock3}
            label="Session expires"
            value={formatUtc(actor.expiresAt)}
          />
          <OverviewCard
            icon={KeyRound}
            label="Recent authentication"
            value={
              actor.recentlyAuthenticated
                ? `Active for ${RECENT_AUTH_WINDOW_MINUTES} minutes`
                : "Passkey confirmation required"
            }
            testId="admin-recent-auth"
          />
          <OverviewCard
            icon={ShieldCheck}
            label="Session policy"
            value={`${SESSION_IDLE_TIMEOUT_MINUTES}m idle · ${SESSION_ABSOLUTE_TIMEOUT_HOURS}h max`}
          />
        </dl>
      </section>

      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-1">
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

function OverviewCard({
  icon: Icon,
  label,
  value,
  testId,
}: {
  readonly icon: typeof UserRound;
  readonly label: string;
  readonly value: string;
  readonly testId?: string;
}): React.JSX.Element {
  return (
    <div className="border-border bg-surface flex min-h-28 flex-col justify-between rounded-xl border p-4">
      <div className="text-text-muted flex items-center gap-2 text-sm">
        <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
        <dt>{label}</dt>
      </div>
      <dd className="mt-4 text-sm font-medium" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
