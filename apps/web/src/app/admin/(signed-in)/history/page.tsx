import AdminHistoryEditor from "@/features/admin/AdminHistoryEditor";
import { AdminPageHeader, AdminPageSurface } from "@/features/admin/AdminPage";
import { requireAdminActor } from "@/server/admin-session";

export const instant = false;

export default async function AdminHistoryPage(): Promise<React.JSX.Element> {
  await requireAdminActor();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader eyebrow="Administration" title="History & access" />
      <AdminPageSurface>
        <AdminHistoryEditor />
      </AdminPageSurface>
    </div>
  );
}
