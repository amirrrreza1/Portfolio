import AdminBlogEditor from "@/features/admin/AdminBlogEditor";
import { AdminPageHeader, AdminPageSurface } from "@/features/admin/AdminPage";
import { requireAdminActor } from "@/server/admin-session";

export default async function AdminArticlesPage(): Promise<React.JSX.Element> {
  await requireAdminActor();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="Publishing"
        title="Articles"
        description="Write, translate, preview, schedule, and publish portfolio articles."
      />
      <AdminPageSurface>
        <AdminBlogEditor />
      </AdminPageSurface>
    </div>
  );
}
