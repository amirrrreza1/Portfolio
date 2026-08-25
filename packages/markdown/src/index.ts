import {
  FRONTMATTER_KEY_ORDER,
  checkPathAgreement,
  frontmatterSchema,
  type Frontmatter,
} from "@portfolio/contracts/content";
import { codeToHast } from "shiki";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import YAML from "yaml";

/** Bump this when the parser, sanitizer, or highlighted output changes. */
export const RENDERER_VERSION = "1";

const MAX_DOCUMENT_BYTES = 512 * 1024;
const MAX_FRONTMATTER_BYTES = 32 * 1024;
const MAX_HEADING_LENGTH = 200;
const SAFE_MEDIA_ID = /^[a-z][0-9a-z]{23}$/;
const SAFE_VIDEO_ID = /^[A-Za-z0-9_-]{6,64}$/;
const SAFE_URL = /^(?:https:\/\/|mailto:|\/(?!\/))/i;
const CODE_LANGUAGES = new Set([
  "bash",
  "css",
  "html",
  "javascript",
  "js",
  "json",
  "jsx",
  "sql",
  "text",
  "ts",
  "tsx",
  "typescript",
  "yaml",
  "yml",
]);

export class MarkdownValidationError extends Error {
  readonly issues: readonly string[];

  constructor(...issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "MarkdownValidationError";
    this.issues = issues;
  }
}

export interface ParsedArticle {
  readonly frontmatter: Frontmatter;
  readonly body: string;
}

export interface Heading {
  readonly depth: number;
  readonly id: string;
  readonly text: string;
}

export interface RenderedArticle extends ParsedArticle {
  readonly html: string;
  readonly headings: readonly Heading[];
  readonly readingTimeMinutes: number;
  readonly rendererVersion: typeof RENDERER_VERSION;
}

export interface RenderedMarkdownBody {
  readonly html: string;
  readonly headings: readonly Heading[];
  readonly readingTimeMinutes: number;
  readonly rendererVersion: typeof RENDERER_VERSION;
}

type Node = Record<string, any> & { type: string };

/**
 * Parse an article envelope without rendering it. YAML aliases/tags are
 * deliberately rejected before conversion so a crafted file cannot consume
 * unbounded memory or instantiate a surprising value.
 */
export function parseArticle(
  source: string,
  expectedPath?: string
): ParsedArticle {
  assertSize(source, MAX_DOCUMENT_BYTES, "Article");

  const normalized = source.replace(/\r\n?/g, "\n");
  if (normalized.charCodeAt(0) === 0xfeff) {
    throw new MarkdownValidationError("UTF-8 BOM is not permitted.");
  }

  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (match === null) {
    throw new MarkdownValidationError(
      "Article must begin with a YAML frontmatter block delimited by --- lines."
    );
  }

  const rawFrontmatter = match[1] ?? "";
  assertSize(rawFrontmatter, MAX_FRONTMATTER_BYTES, "Frontmatter");
  if (/(^|\s)[!&*][^\s]/m.test(rawFrontmatter)) {
    throw new MarkdownValidationError(
      "YAML custom tags, anchors, and aliases are not permitted."
    );
  }

  const document = YAML.parseDocument(rawFrontmatter, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0 || document.warnings.length > 0) {
    throw new MarkdownValidationError(
      ...[...document.errors, ...document.warnings].map((issue) =>
        issue.message.replace(/\s+at line.*$/s, "")
      )
    );
  }

  let raw: unknown;
  try {
    raw = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw new MarkdownValidationError(
      `Could not safely read frontmatter: ${errorMessage(error)}`
    );
  }

  const parsed = frontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    throw new MarkdownValidationError(
      ...parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "frontmatter"}: ${issue.message}`
      )
    );
  }

  if (expectedPath !== undefined) {
    const mismatches = checkPathAgreement(expectedPath, parsed.data);
    if (mismatches.length > 0) {
      throw new MarkdownValidationError(
        ...mismatches.map(
          (mismatch) =>
            `${mismatch.field} does not match its content path (${mismatch.inPath}).`
        )
      );
    }
  }

  const body = normalized.slice(match[0].length);
  if (body.trim().length === 0) {
    throw new MarkdownValidationError("Article body must not be empty.");
  }

  return { frontmatter: parsed.data, body };
}

/** Serialize byte-stably: fixed key order, LF, UTF-8-compatible text, one EOF LF. */
export function serializeArticle(article: ParsedArticle): string {
  const frontmatter = frontmatterSchema.parse(article.frontmatter);
  const ordered = Object.fromEntries(
    FRONTMATTER_KEY_ORDER.map((key) => [key, frontmatter[key]])
  );
  const body = article.body.replace(/\r\n?/g, "\n").replace(/\n+$/g, "");
  if (body.trim().length === 0) {
    throw new MarkdownValidationError("Article body must not be empty.");
  }

  return `---\n${YAML.stringify(ordered, {
    lineWidth: 0,
    nullStr: "null",
  })}---\n${body}\n`;
}

/** Parse, validate, and render a full article through the server-only pipeline. */
export async function renderArticle(
  source: string,
  expectedPath?: string
): Promise<RenderedArticle> {
  const article = parseArticle(source, expectedPath);
  const rendered = await renderMarkdownBodyInternal(article.body, true);

  return {
    ...article,
    ...rendered,
  };
}

/**
 * Validate and render a standalone GFM body through the bounded,
 * sanitize-last pipeline. Portfolio project descriptions use this form
 * because they are stored in a database field rather than inside an article
 * frontmatter envelope. Article-only custom directives are deliberately not
 * accepted because the public project renderer implements plain GFM.
 */
export async function renderMarkdownBody(
  source: string
): Promise<RenderedMarkdownBody> {
  return renderMarkdownBodyInternal(source, false);
}

/** Render authoritative article Markdown stored separately from its metadata. */
export async function renderArticleBody(
  source: string
): Promise<RenderedMarkdownBody> {
  return renderMarkdownBodyInternal(source, true);
}

async function renderMarkdownBodyInternal(
  source: string,
  allowDirectives: boolean
): Promise<RenderedMarkdownBody> {
  assertSize(source, MAX_DOCUMENT_BYTES, "Markdown body");
  const body = source.replace(/\r\n?/g, "\n").trim();
  if (body.length === 0) {
    throw new MarkdownValidationError(
      "Markdown body must contain readable text."
    );
  }
  const headings: Heading[] = [];

  const parser: any = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective);
  if (allowDirectives) {
    parser.use(validateDirectives);
  } else {
    parser.use(rejectDirectives);
  }
  const html = String(
    await parser
      .use(rejectUnsafeMarkdown)
      .use(extractAndIdentifyHeadings, headings)
      .use(remarkRehype)
      .use(highlightCodeBlocks)
      .use(addHeadingAnchorsAndExternalLinkPolicy)
      .use(rehypeSanitize, sanitizeSchema)
      .use(rehypeStringify)
      .process(body)
  );

  if (html.trim().length === 0) {
    throw new MarkdownValidationError(
      "Article body produced no readable content."
    );
  }

  return {
    html,
    headings,
    readingTimeMinutes: readingTime(body),
    rendererVersion: RENDERER_VERSION,
  };
}

/**
 * The constrained profile used by portfolio text fields. It deliberately has
 * no headings, blocks, images, directives, tables, or raw HTML.
 */
export async function renderInlineMarkdown(source: string): Promise<string> {
  assertSize(source, 16 * 1024, "Inline Markdown");
  const parser = unified().use(remarkParse).use(rejectUnsafeMarkdown);
  const tree = parser.parse(source) as Node;
  const allowed = new Set([
    "root",
    "paragraph",
    "text",
    "emphasis",
    "strong",
    "inlineCode",
    "link",
    "break",
  ]);
  visit(tree as any, (node: Node) => {
    if (!allowed.has(node.type)) {
      throw new MarkdownValidationError(
        `Inline Markdown does not permit ${node.type}.`
      );
    }
  });
  rejectUnsafeMarkdown()(tree);

  const renderer: any = unified()
    .use(remarkRehype)
    .use(addHeadingAnchorsAndExternalLinkPolicy)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify);
  const rendered = await renderer.run(tree as any);
  return String(renderer.stringify(rendered));
}

function rejectUnsafeMarkdown() {
  return (tree: Node) => {
    let visibleText = 0;
    visit(tree as any, (node: Node) => {
      if (node.type === "html") {
        throw new MarkdownValidationError("Raw HTML is not permitted.");
      }
      if (node.type === "heading" && node.depth === 1) {
        throw new MarkdownValidationError(
          "Article bodies must not contain an H1."
        );
      }
      if (node.type === "link" || node.type === "image") {
        const url = String(node.url ?? "");
        if (!SAFE_URL.test(url)) {
          throw new MarkdownValidationError(`Unsafe ${node.type} URL: ${url}`);
        }
      }
      if (
        node.type === "text" ||
        node.type === "inlineCode" ||
        node.type === "code"
      ) {
        visibleText += String(node.value ?? "").trim().length;
      }
      if (String(node.type).endsWith("Directive")) {
        visibleText += 1;
      }
    });
    if (visibleText === 0) {
      throw new MarkdownValidationError(
        "Article body must contain readable text."
      );
    }
  };
}

function validateDirectives() {
  return (tree: Node) => {
    visit(tree as any, (node: Node) => {
      if (!String(node.type).endsWith("Directive")) return;

      const attributes = (node.attributes ?? {}) as Record<string, unknown>;
      const fail = (message: string): never => {
        throw new MarkdownValidationError(
          `Invalid ${node.name} directive: ${message}`
        );
      };
      const only = (...keys: string[]) => {
        for (const key of Object.keys(attributes)) {
          if (!keys.includes(key)) fail(`unknown attribute "${key}".`);
        }
      };
      const text = (key: string, required = true): string | undefined => {
        const value = attributes[key];
        if (value === undefined || value === null || value === "") {
          if (required) fail(`"${key}" is required.`);
          return undefined;
        }
        if (typeof value !== "string" || value.length > 300) {
          fail(`"${key}" must be a short string.`);
        }
        return value as string;
      };
      const requiredText = (key: string): string => {
        const value = text(key);
        return value === undefined ? fail(`"${key}" is required.`) : value;
      };

      switch (node.name) {
        case "callout": {
          only("type", "title");
          const type = requiredText("type");
          if (!new Set(["note", "tip", "warning", "danger"]).has(type)) {
            fail('"type" must be note, tip, warning, or danger.');
          }
          node.data = {
            hName: "aside",
            hProperties: {
              className: ["directive", "directive-callout", `is-${type}`],
              "data-directive": "callout",
              "aria-label": text("title", false) ?? `${type} callout`,
            },
          };
          break;
        }
        case "figure": {
          only("src", "alt", "caption");
          const src = requiredText("src");
          requiredText("alt");
          if (!SAFE_MEDIA_ID.test(src)) fail("src must be a MediaAsset ID.");
          node.data = {
            hName: "figure",
            hProperties: {
              className: ["directive", "directive-figure"],
              "data-directive": "figure",
            },
          };
          break;
        }
        case "video": {
          only("provider", "id", "title");
          const provider = requiredText("provider");
          const id = requiredText("id");
          if (provider !== "youtube" && provider !== "vimeo")
            fail("provider must be youtube or vimeo.");
          if (id === undefined || !SAFE_VIDEO_ID.test(id))
            fail("id has an invalid format.");
          requiredText("title");
          node.data = {
            hName: "a",
            hProperties: {
              className: ["directive", "directive-video"],
              "data-directive": "video",
              href:
                provider === "youtube"
                  ? `https://www.youtube.com/watch?v=${id}`
                  : `https://vimeo.com/${id}`,
            },
          };
          break;
        }
        case "details": {
          only("summary");
          const summary = requiredText("summary");
          node.data = {
            hName: "details",
            hProperties: {
              className: ["directive", "directive-details"],
              "data-directive": "details",
              "data-summary": summary,
            },
          };
          break;
        }
        case "steps": {
          only("start");
          const start = text("start", false);
          if (
            start !== undefined &&
            (!/^\d+$/.test(start) || Number(start) < 1)
          ) {
            fail("start must be a positive integer.");
          }
          node.data = {
            hName: "ol",
            hProperties: {
              className: ["directive", "directive-steps"],
              "data-directive": "steps",
              start,
            },
          };
          break;
        }
        default:
          fail("directive is not allowlisted.");
      }
    });
  };
}

function rejectDirectives() {
  return (tree: Node) => {
    visit(tree as any, (node: Node) => {
      if (String(node.type).endsWith("Directive")) {
        throw new MarkdownValidationError(
          "Directives are not permitted in standalone Markdown."
        );
      }
    });
  };
}

function extractAndIdentifyHeadings(headings: Heading[]) {
  return (tree: Node) => {
    const seen = new Map<string, number>();
    visit(tree as any, "heading", (node: Node) => {
      const text = plainText(node).trim();
      if (text.length === 0 || text.length > MAX_HEADING_LENGTH) {
        throw new MarkdownValidationError(
          "Headings must contain at most 200 characters."
        );
      }
      const base = slugify(text);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count + 1}`;
      headings.push({ depth: node.depth, id, text });
      node.data = {
        ...(node.data ?? {}),
        hProperties: { ...(node.data?.hProperties ?? {}), id },
      };
    });
  };
}

function highlightCodeBlocks() {
  return async (tree: Node) => highlightChildren(tree);
}

async function highlightChildren(parent: Node): Promise<void> {
  if (!Array.isArray(parent.children)) return;
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index] as Node;
    if (child.type === "element" && child.tagName === "pre") {
      const code = child.children?.[0] as Node | undefined;
      if (code?.type === "element" && code.tagName === "code") {
        const classNames = Array.isArray(code.properties?.className)
          ? code.properties.className
          : [];
        const languageClass = classNames.find((value: unknown) =>
          String(value).startsWith("language-")
        );
        const requested = languageClass
          ? String(languageClass).slice("language-".length).toLowerCase()
          : "text";
        const language = CODE_LANGUAGES.has(requested) ? requested : "text";
        const highlighted = (await codeToHast(plainText(code), {
          lang: language as any,
          themes: { light: "github-light", dark: "github-dark" },
          // `defaultColor: false` is what makes the two themes selectable.
          //
          // With a default colour Shiki writes one theme's value into `color`
          // and the other into `--shiki-dark`, so the rendered block is stuck
          // on whichever theme was named as the default unless CSS overrides
          // an inline style — which needs `!important` and still leaves the
          // wrong colour in the markup for anything that reads it. With the
          // default disabled, Shiki emits only `--shiki-light`/`--shiki-dark`
          // custom properties. globals.css explicitly selects the matching
          // property for the chosen `data-theme` rather than following
          // `prefers-color-scheme`. The surface itself is painted by
          // `--color-code-bg`/`--color-code-text`, which is what the
          // THEMING.md §9 contrast matrix actually measures.
          defaultColor: false,
        })) as unknown as Node;
        const replacement = highlighted.children?.[0] as Node | undefined;
        if (replacement !== undefined) {
          replacement.properties = {
            ...(replacement.properties ?? {}),
            className: [
              ...((replacement.properties?.className as string[] | undefined) ??
                []),
              "code-block",
              language === requested ? "language-known" : "language-unknown",
            ],
            "aria-label":
              language === requested
                ? requested + " code block"
                : "Plain-text code block; " +
                  requested +
                  " is not an enabled language",
          };
          parent.children[index] = replacement;
        }
        continue;
      }
    }
    await highlightChildren(child);
  }
}

function addHeadingAnchorsAndExternalLinkPolicy() {
  return (tree: Node) => {
    visit(tree as any, "element", (node: Node) => {
      if (
        node.tagName === "h2" ||
        node.tagName === "h3" ||
        node.tagName === "h4" ||
        node.tagName === "h5" ||
        node.tagName === "h6"
      ) {
        const id = node.properties?.id;
        if (typeof id === "string") {
          node.children = [
            {
              type: "element",
              tagName: "a",
              properties: {
                href: `#${id}`,
                className: ["heading-anchor"],
                "aria-label": `Link to ${plainText(node)}`,
              },
              children: [{ type: "text", value: "#" }],
            },
            ...(node.children ?? []),
          ];
        }
      }
      if (
        node.tagName === "a" &&
        typeof node.properties?.href === "string" &&
        /^https:/i.test(node.properties.href)
      ) {
        node.properties = {
          ...node.properties,
          rel: ["noopener", "noreferrer", "nofollow", "ugc"],
          target: "_blank",
        };
      }
    });
  };
}

const defaultAttributes = defaultSchema.attributes ?? {};

const sanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: "",
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "aside",
    "details",
    "figure",
    "figcaption",
    "summary",
  ],
  attributes: {
    ...defaultAttributes,
    "*": [
      ...(defaultAttributes["*"] ?? []),
      "className",
      "dataDirective",
      "dataLanguage",
      "dataHighlighted",
      "dataSummary",
    ],
    a: [...(defaultAttributes.a ?? []), "href", "rel", "target", "ariaLabel"],
    code: [...(defaultAttributes.code ?? []), "className"],
    pre: [
      ...(defaultAttributes.pre ?? []),
      "className",
      "style",
      "dataLanguage",
      "dataHighlighted",
    ],
    span: [...(defaultAttributes.span ?? []), "className", "style"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["https", "mailto"],
    src: ["https"],
  },
};

function plainText(node: Node): string {
  if (
    node.type === "text" ||
    node.type === "inlineCode" ||
    node.type === "code"
  )
    return String(node.value ?? "");
  return Array.isArray(node.children)
    ? node.children.map((child: Node) => plainText(child)).join("")
    : "";
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[\u200c\s]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "section";
}

function readingTime(value: string): number {
  const words = value.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function assertSize(value: string, maximum: number, name: string): void {
  if (Buffer.byteLength(value, "utf8") > maximum) {
    throw new MarkdownValidationError(
      `${name} exceeds the ${maximum} byte limit.`
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
