import { redirect } from "next/navigation";

import AdminLoginForm from "@/features/admin/AdminLoginForm";
import { readAdminActor } from "@/server/admin-session";

export default async function AdminLoginPage(): Promise<React.JSX.Element> {
  // A signed-in visitor has no business on the sign-in page, but a failure to
  // reach the API must not keep them off it either: if the check itself
  // breaks, showing the form is the correct fallback, because the form is what
  // a person who cannot get in needs to see.
  let signedIn = false;
  try {
    signedIn = (await readAdminActor()) !== null;
  } catch {
    signedIn = false;
  }
  if (signedIn) redirect("/admin");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-text-muted text-sm">
          Your password, then your passkey. Both are required.
        </p>
      </div>
      <AdminLoginForm />
    </div>
  );
}
