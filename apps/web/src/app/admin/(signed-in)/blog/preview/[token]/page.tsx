import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { readAdminPreview, requireAdminActor } from "@/server/admin-session";

export const instant = false;

/**
 * Unpublished work must never be indexable, and the header is not enough on
 * its own — a crawler that follows a link from a leaked page reads the tag in
 * the markup. Both are set: `apps/web/src/proxy.ts` puts `X-Robots-Tag` on
 * every admin response, and this states the same thing in the document.
 */
export const metadata: Metadata = {
  title: "Article preview",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The preview route.
 *
 * It renders the HTML the **production pipeline** produced — the API called
 * `renderArticleBody`, the same function a save calls — inside the same
 * `.blog-reading-surface` the public article page uses. A preview that used a
 * different renderer or a different stylesheet would be a preview of something
 * other than what publishing produces, which is the one thing it must not be.
 *
 * The HTML is already sanitized: it left the renderer through `rehypeSanitize`
 * with the article schema, which is what makes `dangerouslySetInnerHTML` the
 * correct tool here rather than a risk. The public article page does exactly
 * the same with exactly the same bytes.
 */
export default async function AdminArticlePreviewPage({
  params,
}: Readonly<{
  params: Promise<{ token: string }>;
}>): Promise<React.JSX.Element> {
  await requireAdminActor();
  const { token } = await params;
  const html = await readAdminPreview(token);
  if (html === null) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="border-accent flex flex-wrap items-center justify-between gap-3 border p-4">
        <div>
          <p className="font-semibold">Preview — not published</p>
          <p className="text-text-muted text-sm">
            Rendered by the production pipeline. This link expires and is not
            indexable.
          </p>
        </div>
      </div>
      <article
        className="blog-reading-surface"
        data-blog-font="jetbrains-mono"
        data-blog-size="md"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
