import AdminCollectionsEditor from "@/features/admin/AdminCollectionsEditor";
import { AdminPageHeader, AdminPageSurface } from "@/features/admin/AdminPage";
import { requireAdminActor } from "@/server/admin-session";

export const instant = false;

export default async function AdminCollectionsPage(): Promise<React.JSX.Element> {
  await requireAdminActor();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader eyebrow="Content" title="Portfolio collections" />
      <AdminPageSurface>
        <AdminCollectionsEditor />
      </AdminPageSurface>
    </div>
  );
}
