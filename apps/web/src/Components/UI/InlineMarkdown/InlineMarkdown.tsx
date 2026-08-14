import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const INLINE_ELEMENTS = ["p", "strong", "em", "code", "a", "br"];

/**
 * Defensive renderer for the restricted portfolio prose profile. The API has
 * already validated the source through @portfolio/markdown; this renderer
 * independently drops raw HTML and refuses every block element outside the
 * inline allowlist before inserting anything into the page.
 */
export default function InlineMarkdown({
  source,
}: {
  readonly source: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      allowedElements={INLINE_ELEMENTS}
      unwrapDisallowed
      skipHtml
      urlTransform={defaultUrlTransform}
      components={{
        p: ({ children }) => <>{children}</>,
        a: ({ href, children }) => (
          <a
            href={href}
            target={href?.startsWith("https://") ? "_blank" : undefined}
            rel={
              href?.startsWith("https://")
                ? "noopener noreferrer nofollow ugc"
                : undefined
            }
          >
            {children}
          </a>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
