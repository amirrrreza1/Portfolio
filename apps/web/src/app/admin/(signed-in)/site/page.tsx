import AdminPortfolioEditor from "@/features/admin/AdminPortfolioEditor";
import { AdminPageHeader, AdminPageSurface } from "@/features/admin/AdminPage";
import { requireAdminActor } from "@/server/admin-session";

export default async function AdminSitePage(): Promise<React.JSX.Element> {
  await requireAdminActor();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="Content"
        title="Site content"
        description="Manage portfolio content, site metadata, social links, and delivery settings."
      />
      <AdminPageSurface>
        <AdminPortfolioEditor />
      </AdminPageSurface>
    </div>
  );
}
