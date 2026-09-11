import AdminEnrolPasskey from "@/features/admin/AdminEnrolPasskey";
import { AdminPageHeader } from "@/features/admin/AdminPage";
import AdminSessionList from "@/features/admin/AdminSessionList";
import { listAdminSessions, requireAdminActor } from "@/server/admin-session";

export const instant = false;

export default async function AdminSecurityPage(): Promise<React.JSX.Element> {
  await requireAdminActor();
  const sessions = await listAdminSessions();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader eyebrow="Administration" title="Security" />

      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-4 sm:p-6 lg:p-8">
        <h2 className="text-lg font-semibold">Active sessions</h2>
        <AdminSessionList sessions={sessions} />
      </section>

      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-4 sm:p-6 lg:p-8">
        <h2 className="text-lg font-semibold">Passkeys</h2>
        <AdminEnrolPasskey />
      </section>
    </div>
  );
}
