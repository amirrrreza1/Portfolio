import AdminCollectionsEditor from "@/features/admin/AdminCollectionsEditor";
import { AdminPageHeader, AdminPageSurface } from "@/features/admin/AdminPage";
import { requireAdminActor } from "@/server/admin-session";

export default async function AdminCollectionsPage(): Promise<React.JSX.Element> {
  await requireAdminActor();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="Content"
        title="Portfolio collections"
        description="Manage skills, projects, certificates, and daily quotes."
      />
      <AdminPageSurface>
        <AdminCollectionsEditor />
      </AdminPageSurface>
    </div>
  );
}
