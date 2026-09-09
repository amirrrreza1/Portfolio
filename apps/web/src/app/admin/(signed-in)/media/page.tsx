import AdminMediaEditor from "@/features/admin/AdminMediaEditor";
import { AdminPageHeader, AdminPageSurface } from "@/features/admin/AdminPage";
import { requireAdminActor } from "@/server/admin-session";

export default async function AdminMediaPage(): Promise<React.JSX.Element> {
  await requireAdminActor();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="Content"
        title="Media & resume"
        description="Upload media, maintain the asset library, and control the active resume."
      />
      <AdminPageSurface>
        <AdminMediaEditor />
      </AdminPageSurface>
    </div>
  );
}
