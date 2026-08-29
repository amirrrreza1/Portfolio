import {
  FRONTMATTER_KEY_ORDER,
  CURRENT_FRONTMATTER_VERSION,
  checkPathAgreement,
  frontmatterSchema,
  type Frontmatter,
} from "@portfolio/contracts/content";
import {
  importFindingSchema,
  type ImportFinding,
} from "@portfolio/contracts/blog";
import { normalizeSlug, type Locale } from "@portfolio/contracts/common";
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

export interface ArticleImportInput {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly expectedPostId: string | null;
  readonly locale: Locale;
  /** Server-minted opaque ID used only when the file has no frontmatter. */
  readonly inferredPostId: string;
}

export interface PreparedArticleImport {
  readonly accepted: boolean;
  readonly findings: readonly ImportFinding[];
  readonly article: ParsedArticle | null;
  /** Always a deterministic `.md` envelope, including for accepted `.mdx`. */
  readonly normalizedDocument: string | null;
}

export const MAX_ARTICLE_IMPORT_BYTES = MAX_DOCUMENT_BYTES;

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

/**
 * Converts one untrusted upload into the exact Markdown envelope an import
 * confirmation would save.
 *
 * This function reports content failures instead of throwing. Transport and
 * persistence failures still throw in the API, but a malformed document is a
 * review result: the author needs line-addressed findings and the original
 * upload remains quarantined as evidence.
 */
export async function prepareArticleImport(
  input: ArticleImportInput
): Promise<PreparedArticleImport> {
  const findings: ImportFinding[] = [];
  const extension = importExtension(input.filename);
  if (extension === null) {
    return rejected([
      finding(
        "error",
        null,
        "UNSUPPORTED_EXTENSION",
        "Choose a .md, .markdown, or .mdx file."
      ),
    ]);
  }
  if (
    input.bytes.byteLength === 0 ||
    input.bytes.byteLength > MAX_ARTICLE_IMPORT_BYTES
  ) {
    return rejected([
      finding(
        "error",
        null,
        "INVALID_SIZE",
        `The import must contain between 1 and ${MAX_ARTICLE_IMPORT_BYTES} bytes.`
      ),
    ]);
  }

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  } catch {
    return rejected([
      finding("error", null, "INVALID_UTF8", "The upload is not valid UTF-8."),
    ]);
  }
  source = source.replace(/\r\n?/g, "\n");

  if (extension === "mdx") {
    findings.push(...inspectMdx(source));
  }

  let article: ParsedArticle | null = null;
  if (/^---\n/u.test(source)) {
    try {
      article = parseArticle(source);
    } catch (error) {
      findings.push(...markdownFindings(error, source));
    }
  } else {
    const inferred = inferArticle(source, input);
    findings.push(...inferred.findings);
    article = inferred.article;
  }

  if (article !== null) {
    if (
      input.expectedPostId !== null &&
      article.frontmatter.postId !== input.expectedPostId
    ) {
      findings.push(
        finding(
          "error",
          frontmatterLine(source, "postId"),
          "POST_ID_MISMATCH",
          "frontmatter.postId does not match the selected article."
        )
      );
    }
    if (article.frontmatter.locale !== input.locale) {
      findings.push(
        finding(
          "error",
          frontmatterLine(source, "locale"),
          "LOCALE_MISMATCH",
          "frontmatter.locale does not match the selected import locale."
        )
      );
    }
  }

  if (article === null || findings.some((item) => item.severity === "error")) {
    return rejected(findings);
  }

  try {
    await renderArticleBody(article.body);
  } catch (error) {
    findings.push(...markdownFindings(error, source));
    return rejected(findings);
  }

  const normalizedDocument = serializeArticle(article);
  if (extension === "mdx") {
    findings.push(
      finding(
        "info",
        null,
        "MDX_NORMALIZED_TO_MARKDOWN",
        "The accepted MDX contains no executable constructs and will be stored as deterministic Markdown."
      )
    );
  }
  return {
    accepted: true,
    findings: findings.map((item) => importFindingSchema.parse(item)),
    article,
    normalizedDocument,
  };
}

/** A compact deterministic unified diff for the review screen. */
export function createArticleImportDiff(
  currentDocument: string | null,
  importedDocument: string
): string {
  const before = currentDocument ?? "";
  if (before === importedDocument) return "";
  const oldLines = splitDocumentLines(before);
  const newLines = splitDocumentLines(importedDocument);
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const contextStart = Math.max(0, prefix - 3);
  const oldChangedEnd = oldLines.length - suffix;
  const newChangedEnd = newLines.length - suffix;
  const oldEnd = Math.min(oldLines.length, oldChangedEnd + 3);
  const newEnd = Math.min(newLines.length, newChangedEnd + 3);
  const oldCount = oldEnd - contextStart;
  const newCount = newEnd - contextStart;
  const lines = [
    "--- current.md",
    "+++ import.md",
    `@@ -${contextStart + 1},${oldCount} +${contextStart + 1},${newCount} @@`,
    ...oldLines.slice(contextStart, prefix).map((line) => ` ${line}`),
    ...oldLines.slice(prefix, oldChangedEnd).map((line) => `-${line}`),
    ...newLines.slice(prefix, newChangedEnd).map((line) => `+${line}`),
    ...newLines.slice(newChangedEnd, newEnd).map((line) => ` ${line}`),
  ];
  return `${lines.join("\n")}\n`;
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
 * What a publish checklist needs to know about an article body, without
 * rendering it.
 *
 * The render pipeline *throws* on an H1, an unsafe URL, or an empty body — so
 * by the time an author could see a rendered article, those problems are
 * already impossible. That is right for the save path and useless for a
 * checklist, whose whole job is to describe a body that is not ready yet. This
 * parses with the same remark configuration and reports instead of refusing.
 *
 * It never throws on content. A body too large to parse at all is the one
 * exception, and that bound is the same one every other entry point applies.
 */
export interface ArticleSourceInspection {
  readonly hasH1: boolean;
  readonly visibleTextLength: number;
  readonly wordCount: number;
  /** Every link and image destination, in document order. */
  readonly urls: readonly string[];
  /** Destinations the renderer would refuse — not merely strip. */
  readonly unsafeUrls: readonly string[];
  /** Root-relative destinations, which are what an internal link looks like. */
  readonly internalUrls: readonly string[];
}

export function inspectArticleSource(source: string): ArticleSourceInspection {
  assertSize(source, MAX_DOCUMENT_BYTES, "Markdown body");
  const body = source.replace(/\r\n?/g, "\n").trim();
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .parse(body) as Node;

  let hasH1 = false;
  let visibleTextLength = 0;
  const urls: string[] = [];
  const unsafeUrls: string[] = [];
  const internalUrls: string[] = [];

  visit(tree as any, (node: Node) => {
    if (node.type === "heading" && node.depth === 1) hasH1 = true;
    if (node.type === "link" || node.type === "image") {
      const url = String(node.url ?? "");
      urls.push(url);
      if (!SAFE_URL.test(url)) unsafeUrls.push(url);
      else if (url.startsWith("/")) internalUrls.push(url);
    }
    if (
      node.type === "text" ||
      node.type === "inlineCode" ||
      node.type === "code"
    ) {
      visibleTextLength += String(node.value ?? "").trim().length;
    }
    if (String(node.type).endsWith("Directive")) visibleTextLength += 1;
  });

  return {
    hasH1,
    visibleTextLength,
    wordCount: body.length === 0 ? 0 : body.split(/\s+/).filter(Boolean).length,
    urls,
    unsafeUrls,
    internalUrls,
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

function importExtension(filename: string): "md" | "markdown" | "mdx" | null {
  const match = /\.([^.\\/]+)$/u.exec(filename.normalize("NFC"));
  const extension = match?.[1]?.toLowerCase();
  return extension === "md" || extension === "markdown" || extension === "mdx"
    ? extension
    : null;
}

function rejected(findings: readonly ImportFinding[]): PreparedArticleImport {
  return {
    accepted: false,
    findings: findings.map((item) => importFindingSchema.parse(item)),
    article: null,
    normalizedDocument: null,
  };
}

function finding(
  severity: ImportFinding["severity"],
  line: number | null,
  code: string,
  message: string
): ImportFinding {
  return importFindingSchema.parse({ severity, line, code, message });
}

function inferArticle(
  source: string,
  input: ArticleImportInput
): {
  readonly article: ParsedArticle | null;
  readonly findings: ImportFinding[];
} {
  const findings: ImportFinding[] = [];
  const lines = source.split("\n");
  const firstContent = lines.findIndex((line) => line.trim().length > 0);
  const heading =
    firstContent >= 0
      ? /^#\s+(.+?)\s*#*\s*$/u.exec(lines[firstContent] ?? "")
      : null;
  const filenameStem = input.filename
    .normalize("NFC")
    .replace(/^.*[\\/]/u, "")
    .replace(/\.(?:md|markdown|mdx)$/iu, "")
    .replace(/[-_]+/gu, " ")
    .trim();
  const title = (heading?.[1]?.trim() || filenameStem).slice(0, 200);
  if (heading !== null && firstContent >= 0) lines.splice(firstContent, 1);
  const body = lines.join("\n").replace(/^\n+/u, "");
  const excerpt = inferExcerpt(body);
  const slug = normalizeSlug(title, input.locale);

  const inferredFields: readonly [string, string][] = [
    ["schemaVersion", "the current import schema"],
    [
      "postId",
      input.expectedPostId === null
        ? "a new opaque ID"
        : "the selected article",
    ],
    ["locale", "the selected locale"],
    ["title", heading === null ? "the filename" : "the first H1"],
    ["slug", "the inferred title"],
    ["excerpt", "the first readable paragraph"],
    ["status", "a safe draft state"],
  ];
  for (const [field, basis] of inferredFields) {
    findings.push(
      finding(
        "info",
        field === "title" && heading !== null ? firstContent + 1 : null,
        `INFERRED_${field.replace(/([A-Z])/g, "_$1").toUpperCase()}`,
        `${field} was inferred from ${basis}; review it before confirmation.`
      )
    );
  }

  if (title.length === 0) {
    findings.push(
      finding(
        "error",
        null,
        "MISSING_TITLE",
        "A title could not be inferred from the first H1 or filename."
      )
    );
  }
  if (slug.length === 0) {
    findings.push(
      finding(
        "error",
        null,
        "MISSING_SLUG",
        "A locale-safe slug could not be inferred from the title."
      )
    );
  }
  if (excerpt.length === 0) {
    findings.push(
      finding(
        "error",
        null,
        "MISSING_EXCERPT",
        "An excerpt could not be inferred from the Markdown body."
      )
    );
  }
  if (findings.some((item) => item.severity === "error")) {
    return { article: null, findings };
  }

  const parsed = frontmatterSchema.safeParse({
    schemaVersion: CURRENT_FRONTMATTER_VERSION,
    postId: input.expectedPostId ?? input.inferredPostId,
    locale: input.locale,
    title,
    slug,
    excerpt,
    status: "draft",
  });
  if (!parsed.success) {
    findings.push(
      ...parsed.error.issues.map((issue) =>
        finding(
          "error",
          null,
          "INVALID_INFERRED_FRONTMATTER",
          `${issue.path.join(".") || "frontmatter"}: ${issue.message}`
        )
      )
    );
    return { article: null, findings };
  }
  return { article: { frontmatter: parsed.data, body }, findings };
}

function inferExcerpt(body: string): string {
  const withoutFences = body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/gu, " ");
  const paragraphs = withoutFences.split(/\n\s*\n/gu);
  for (const paragraph of paragraphs) {
    const readable = paragraph
      .replace(/^#{1,6}\s+/gmu, "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
      .replace(/[*_~`>|]/gu, " ")
      .replace(/^\s*(?:[-+*]|\d+\.)\s+/gmu, "")
      .replace(/\s+/gu, " ")
      .trim();
    if (readable.length > 0) return readable.slice(0, 400).trim();
  }
  return "";
}

function inspectMdx(source: string): readonly ImportFinding[] {
  const findings: ImportFinding[] = [];
  const { body, firstLine } = importBody(source);
  const lines = body.split("\n");
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fenceMatch = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1]?.[0] ?? null;
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const lineNumber = firstLine + index;
    if (/^\s*import\s+(?:[\w*{]|["'])/u.test(line)) {
      findings.push(
        finding(
          "error",
          lineNumber,
          "MDX_IMPORT",
          "MDX import declarations are executable and are not permitted."
        )
      );
    }
    if (
      /^\s*export\s+(?:default\b|(?:const|let|var|function|class)\b|\{)/u.test(
        line
      )
    ) {
      findings.push(
        finding(
          "error",
          lineNumber,
          "MDX_EXPORT",
          "MDX export declarations are executable and are not permitted."
        )
      );
    }
    const component = /<\/?([A-Z][A-Za-z0-9.]*)\b/u.exec(line)?.[1];
    if (component !== undefined) {
      findings.push(
        finding(
          "error",
          lineNumber,
          "UNMAPPED_MDX_COMPONENT",
          `The JSX component ${component} is not mapped to an allowlisted Markdown directive.`
        )
      );
    }
    if (
      !/^\s*:{1,3}[\w-]+(?:\{.*\})?\s*$/u.test(line) &&
      /(^|[^\\])\{[^}\n]*\}/u.test(line)
    ) {
      findings.push(
        finding(
          "error",
          lineNumber,
          "MDX_EXPRESSION",
          "MDX expressions are executable and are not permitted."
        )
      );
    }
  }
  return findings;
}

function importBody(source: string): {
  readonly body: string;
  readonly firstLine: number;
} {
  const match = /^---\n[\s\S]*?\n---(?:\n|$)/u.exec(source);
  if (match === null) return { body: source, firstLine: 1 };
  return {
    body: source.slice(match[0].length),
    firstLine: match[0].split("\n").length,
  };
}

function markdownFindings(
  error: unknown,
  source: string
): readonly ImportFinding[] {
  const issues =
    error instanceof MarkdownValidationError
      ? error.issues
      : [error instanceof Error ? error.message : "The document is invalid."];
  return issues.map((message) => {
    const lower = message.toLowerCase();
    const code = lower.includes("raw html")
      ? "RAW_HTML"
      : lower.includes("unsafe") && lower.includes("url")
        ? "UNSAFE_URL"
        : lower.includes("h1")
          ? "BODY_HAS_H1"
          : lower.includes("directive")
            ? "INVALID_DIRECTIVE"
            : lower.includes("bom")
              ? "UTF8_BOM"
              : "INVALID_MARKDOWN";
    return finding("error", lineForIssue(source, message), code, message);
  });
}

function lineForIssue(source: string, message: string): number | null {
  const field = /^([A-Za-z][A-Za-z0-9]*)(?:\.|:)/u.exec(message)?.[1];
  if (field !== undefined) {
    const line = frontmatterLine(source, field);
    if (line !== null) return line;
  }
  const lines = source.split("\n");
  if (/raw html/iu.test(message)) {
    const index = lines.findIndex((line) => /<\/?[A-Za-z][^>]*>/u.test(line));
    return index < 0 ? null : index + 1;
  }
  if (/H1/iu.test(message)) {
    const index = lines.findIndex((line) => /^#\s+/u.test(line));
    return index < 0 ? null : index + 1;
  }
  const url = /URL:\s*(\S+)/iu.exec(message)?.[1];
  if (url !== undefined) {
    const index = lines.findIndex((line) => line.includes(url));
    return index < 0 ? null : index + 1;
  }
  return null;
}

function frontmatterLine(source: string, field: string): number | null {
  const lines = source.split("\n");
  const end = lines.slice(1).findIndex((line) => line === "---");
  if (lines[0] !== "---" || end < 0) return null;
  const pattern = new RegExp(
    `^${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`,
    "u"
  );
  const index = lines.slice(1, end + 1).findIndex((line) => pattern.test(line));
  return index < 0 ? null : index + 2;
}

function splitDocumentLines(document: string): readonly string[] {
  if (document.length === 0) return [];
  const withoutFinalNewline = document.endsWith("\n")
    ? document.slice(0, -1)
    : document;
  return withoutFinalNewline.split("\n");
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
