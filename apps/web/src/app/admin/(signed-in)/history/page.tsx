import AdminHistoryEditor from "@/features/admin/AdminHistoryEditor";
import { AdminPageHeader, AdminPageSurface } from "@/features/admin/AdminPage";
import { requireAdminActor } from "@/server/admin-session";

export default async function AdminHistoryPage(): Promise<React.JSX.Element> {
  await requireAdminActor();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="Administration"
        title="History & access"
        description="Review revisions and audit events, restore earlier content, and manage permissions."
      />
      <AdminPageSurface>
        <AdminHistoryEditor />
      </AdminPageSurface>
    </div>
  );
}
