import { redirect } from "next/navigation";

import AdminRecoveryForm from "@/features/admin/AdminRecoveryForm";
import { readAdminActor } from "@/server/admin-session";

export default async function AdminRecoveryPage(): Promise<React.JSX.Element> {
  let signedIn = false;
  try {
    signedIn = (await readAdminActor()) !== null;
  } catch {
    signedIn = false;
  }
  if (signedIn) redirect("/admin");

  return (
    <main
      id="admin-main"
      className="mx-auto flex min-h-screen w-[90%] max-w-sm flex-col justify-center gap-6 py-12"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Recovery</h1>
        <p className="text-text-muted text-sm">
          Use one of the codes issued when the account was provisioned. Each
          code works once.
        </p>
      </div>
      <AdminRecoveryForm />
    </main>
  );
}
