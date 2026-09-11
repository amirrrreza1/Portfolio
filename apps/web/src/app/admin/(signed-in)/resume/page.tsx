import AdminResumeEditor from "@/features/admin/AdminResumeEditor";
import { AdminPageHeader, AdminPageSurface } from "@/features/admin/AdminPage";
import { requireAdminActor } from "@/server/admin-session";

export const instant = false;

export default async function AdminResumePage(): Promise<React.JSX.Element> {
  await requireAdminActor();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader eyebrow="Content" title="Resume" />
      <AdminPageSurface>
        <AdminResumeEditor />
      </AdminPageSurface>
    </div>
  );
}
