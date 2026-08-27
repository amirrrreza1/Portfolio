import type { Metadata } from "next";

/**
 * The admin frame.
 *
 * It deliberately does not check for a session. Two of its children —
 * `/admin/login` and `/admin/recovery` — exist precisely for people who do not
 * have one, and a guard here would lock out the only person who could ever
 * pass it. The check lives in the `(signed-in)` group instead, and again in
 * every page inside it.
 *
 * The panel is English-only in this release (PRODUCT_SPEC.md §7), which is why
 * nothing here reads a locale.
 */
export const metadata: Metadata = {
  title: "Portfolio admin",
  // Belt and braces with the `X-Robots-Tag` the proxy sets: a crawler that
  // ignores one usually honours the other, and neither costs anything.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin pages are never prerendered.
 *
 * Every one of them renders against a specific session, and a statically
 * generated admin page is a page that was rendered with nobody signed in and
 * then served to somebody who is.
 */
export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <div className="mx-auto w-[95%] max-w-4xl py-10">
      <a
        href="#admin-main"
        className="border-border bg-surface sr-only border p-2 focus:not-sr-only focus:absolute"
      >
        Skip to content
      </a>
      <main id="admin-main">{children}</main>
    </div>
  );
}
