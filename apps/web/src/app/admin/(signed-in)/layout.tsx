import { Suspense } from "react";
import { requireAdminActor } from "@/server/admin-session";
import { PanelsTopLeft } from "lucide-react";

import AdminNavigation from "@/features/admin/AdminNavigation";
import SignOutButton from "@/features/admin/SignOutButton";

export const instant = false;

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
    <div
      className="min-h-screen lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]"
      data-testid="admin-actor"
    >
      <aside className="border-border bg-surface hidden h-screen flex-col border-r lg:sticky lg:top-0 lg:flex">
        <div className="border-border flex h-20 items-center gap-3 border-b px-6">
          <span className="bg-accent text-bg flex size-9 items-center justify-center rounded-lg">
            <PanelsTopLeft aria-hidden="true" size={18} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Portfolio</p>
            <p className="text-text-muted text-xs">Admin dashboard</p>
          </div>
        </div>

        <Suspense fallback={<div className="flex-1" />}>
          <AdminNavigation />
        </Suspense>

        <div className="border-border border-t p-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <span className="bg-secondary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              {actor.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {actor.displayName}
              </p>
              <p className="text-text-muted text-xs">{actor.role}</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-border bg-bg/95 sticky top-0 z-30 border-b backdrop-blur lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-accent text-bg flex size-8 shrink-0 items-center justify-center rounded-lg">
                <PanelsTopLeft
                  aria-hidden="true"
                  size={17}
                  strokeWidth={2.25}
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  Portfolio admin
                </p>
                <p className="text-text-muted truncate text-xs">
                  {actor.displayName} · {actor.role}
                </p>
              </div>
            </div>
            <SignOutButton compact />
          </div>
          <Suspense fallback={<div className="h-12" />}>
            <AdminNavigation mobile />
          </Suspense>
        </header>

        <main
          id="admin-main"
          className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
