import { requireAdminActor } from "@/server/admin-session";

import SignOutButton from "@/features/admin/SignOutButton";

/**
 * Everything inside this group requires a verified session.
 *
 * `requireAdminActor` asks the API, which re-reads the session record and its
 * expiry, revocation, and account status. It throws a redirect when the answer
 * is no, so there is no path on which a child of this layout renders without
 * one — a caller cannot forget to return early from a function that never
 * returns.
 *
 * The pages inside ask again rather than trusting this layout to have asked.
 * The check is memoized per request, so the second question costs nothing and
 * the guarantee stops depending on component nesting.
 */
export default async function SignedInAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  const actor = await requireAdminActor();

  return (
    <div className="flex flex-col gap-8">
      <header className="border-border flex flex-col gap-3 border-b pb-5 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Portfolio admin</h1>
          <p className="text-text-muted text-sm" data-testid="admin-actor">
            Signed in as {actor.displayName} · {actor.role}
          </p>
        </div>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
