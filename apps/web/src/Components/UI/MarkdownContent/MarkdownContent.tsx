import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

/**
 * Defense-in-depth renderer for API-validated project Markdown. Raw HTML is
 * discarded and the browser-facing render is sanitized independently of the
 * API validation boundary.
 */
export default function MarkdownContent({
  source,
}: {
  readonly source: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      skipHtml
      urlTransform={defaultUrlTransform}
      components={{
        h1: ({ children }) => <h2>{children}</h2>,
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
