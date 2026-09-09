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

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <div className="bg-bg min-h-screen">
      <a
        href="#admin-main"
        className="border-border bg-surface sr-only z-50 border px-4 py-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {children}
    </div>
  );
}
