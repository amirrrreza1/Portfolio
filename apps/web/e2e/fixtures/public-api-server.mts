import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { publicAppearanceEnvelopeSchema } from "@portfolio/contracts/appearance";
import { publicArticleDetailEnvelopeSchema } from "@portfolio/contracts/blog";
import { publicArticleListEnvelopeSchema } from "@portfolio/contracts/blog";
import {
  publicHomeEnvelopeSchema,
  publicProjectsEnvelopeSchema,
  publicSiteEnvelopeSchema,
} from "@portfolio/contracts/portfolio";
import { renderMarkdownBody } from "@portfolio/markdown";

/**
 * The public API, replaced by a fixture, for the THEMING.md §9 browser matrix.
 *
 * What is under test here is the web application: its first response, its
 * cookie handling, its stylesheet, its CSP, and its font requests. None of that
 * depends on where the DTOs came from, and standing up PostgreSQL, MinIO, and
 * the Nest API to render one article would make the suite unrunnable in CI for
 * no gain in what it proves.
 *
 * Two properties keep this honest:
 *
 * 1. Every response is built by parsing through the SAME contract schema the
 *    real API projects and the web client validates. A DTO change that would
 *    break the real read breaks this fixture at typecheck or at parse.
 * 2. The article body is rendered by the real `@portfolio/markdown` pipeline,
 *    so the Shiki markup the browser receives is the markup a published article
 *    receives — inline custom properties, class names, sanitizer and all. The
 *    code-block theming assertions would be worthless against a hand-written
 *    string.
 *
 * Two control endpoints sit outside the API surface. `/__fixture/fail` flips
 * every read to 500, which is how the localized `503` and its security headers
 * are exercised. `/__fixture/requests` reports how many times each resource has
 * actually been fetched, which is what turns "two visitors with different
 * preferences reuse one public-data cache entry" from an assumption into an
 * assertion.
 */

const ARTICLE_SLUG = "theme-token-matrix";
const ARTICLE_SLUG_FA = "ماتریس-تم";

/**
 * The fixture body carries one of every block the reading surface styles.
 *
 * Until 2026-08-28 it was two paragraphs around a code block, and that is
 * exactly why the matrix could not see that article typography was missing
 * entirely: with no heading, list, or blockquote in the fixture, a stylesheet
 * that styled none of them measured the same as one that styled all of them.
 */
const ARTICLE_MARKDOWN = `A paragraph before the code, to prove body text picks up the reading surface.

## A section heading

A paragraph under the heading.

- A first list item
- A second list item

> A quotation, to prove the blockquote rule is present.

\`\`\`ts
const theme: string = "dark";
// a comment token
\`\`\`

A paragraph after, with \`inline code\` and [a link](/en/blog/other).
`;

function summary(slug: string, locale: "en" | "fa") {
  return {
    id: "p12345678901234567890123",
    slug,
    title: locale === "fa" ? "ماتریس تم" : "Theme token matrix",
    excerpt: locale === "fa" ? "خلاصه آزمایشی." : "A fixture summary.",
    publishedAt: "2026-08-14T12:00:00.000Z",
    updatedAt: "2026-08-14T12:00:00.000Z",
    readingMinutes: 3,
    authorName: "Amirreza Azarioun",
    categoryKey: "engineering",
    tagKeys: ["typescript"],
    featured: false,
  };
}

function appearanceEnvelope(locale: "en" | "fa") {
  return publicAppearanceEnvelopeSchema.parse({
    data: {
      locale,
      themes: ["dark", "light"],
      defaultTheme: "dark",
      blogFonts:
        locale === "fa"
          ? [
              { key: "vazir-code", displayName: "Vazir Code" },
              { key: "system-sans", displayName: "System sans" },
            ]
          : [
              { key: "jetbrains-mono", displayName: "JetBrains Mono" },
              { key: "vazir-code", displayName: "Vazir Code" },
              { key: "system-sans", displayName: "System sans" },
            ],
      defaultBlogFont: locale === "fa" ? "vazir-code" : "jetbrains-mono",
      blogSizes: ["sm", "md", "lg", "xl"],
      defaultBlogSize: "md",
      offerMotionToggle: true,
    },
    meta: { requestId: `appearance-${locale}` },
  });
}

function siteEnvelope(locale: "en" | "fa") {
  const fa = locale === "fa";
  return publicSiteEnvelopeSchema.parse({
    data: {
      locale,
      settings: {
        canonicalSiteUrl: "http://127.0.0.1:3210",
        defaultLocale: "en",
        enabledLocales: ["en", "fa"],
        siteName: fa ? "امیررضا آذریون" : "Amirreza Azarioun",
        titleTemplate: fa ? "%s | امیررضا آذریون" : "%s | Amirreza Azarioun",
        metaDescription: fa ? "وب‌سایت شخصی" : "Portfolio fixture site",
        keywords: ["portfolio"],
        footerLines: [],
        footerRights: fa ? "تمام حقوق محفوظ است" : "All rights reserved",
        resumeButtonLabel: fa ? "دریافت رزومه" : "Download resume",
        siteVerification: { google: null, bing: null },
        authorName: "Amirreza Azarioun",
        creatorName: "Amirreza Azarioun",
        publisherName: "Amirreza Azarioun",
        contactEnabled: true,
        githubUsername: "amirrrreza1",
        githubRepoAllowlist: [],
        githubCacheTtlSeconds: 3_600,
        robotsAllowIndexing: false,
      },
      sections: [
        {
          key: "hero",
          title: fa ? "امیررضا آذریون" : "Amirreza Azarioun",
          content: {
            variant: "primary",
            lines: [fa ? "توسعه‌دهنده فرانت‌اند" : "Frontend Developer"],
          },
        },
      ],
      navigation: [
        {
          id: "navhome00000000000000000",
          label: fa ? "خانه" : "Home",
          iconKey: null,
          targetKind: "SECTION_ANCHOR",
          target: "hero",
        },
      ],
      socialLinks: [
        {
          id: "socialgithub000000000000",
          label: "GitHub",
          iconKey: null,
          rel: null,
          kind: "SOCIAL",
          url: "https://github.com/amirrrreza1",
        },
      ],
    },
    meta: { requestId: `site-${locale}` },
  });
}

function homeEnvelope(locale: "en" | "fa") {
  return publicHomeEnvelopeSchema.parse({
    data: { locale, quote: null, certificates: [], resume: null },
    meta: { requestId: `home-${locale}` },
  });
}

function projectsEnvelope(locale: "en" | "fa") {
  return publicProjectsEnvelopeSchema.parse({
    data: { locale, projects: [], skillCategories: [] },
    meta: { requestId: `projects-${locale}` },
  });
}

function articleListEnvelope(locale: "en" | "fa") {
  return publicArticleListEnvelopeSchema.parse({
    data: {
      locale,
      posts: [
        summary(locale === "fa" ? ARTICLE_SLUG_FA : ARTICLE_SLUG, locale),
      ],
    },
    meta: { requestId: `list-${locale}`, nextCursor: null },
  });
}

async function articleDetailEnvelope(locale: "en" | "fa") {
  const slug = locale === "fa" ? ARTICLE_SLUG_FA : ARTICLE_SLUG;
  const rendered = await renderMarkdownBody(ARTICLE_MARKDOWN);

  return publicArticleDetailEnvelopeSchema.parse({
    data: {
      locale,
      post: {
        ...summary(slug, locale),
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        renderedHtml: rendered.html,
        headings: [],
        alternates: [
          { locale: "en", slug: ARTICLE_SLUG },
          { locale: "fa", slug: ARTICLE_SLUG_FA },
        ],
      },
    },
    meta: { requestId: `detail-${locale}` },
  });
}

async function resolve(
  locale: "en" | "fa",
  resource: string
): Promise<unknown | undefined> {
  if (resource === "appearance") return appearanceEnvelope(locale);
  if (resource === "site") return siteEnvelope(locale);
  if (resource === "home") return homeEnvelope(locale);
  if (resource === "projects") return projectsEnvelope(locale);
  if (resource === "blog/posts") return articleListEnvelope(locale);
  if (resource.startsWith("blog/posts/")) {
    const slug = decodeURIComponent(resource.slice("blog/posts/".length));
    const expected = locale === "fa" ? ARTICLE_SLUG_FA : ARTICLE_SLUG;
    if (slug !== expected) return undefined;
    return articleDetailEnvelope(locale);
  }
  return undefined;
}

let failing = false;
const requestCounts = new Map<string, number>();
const bodyCounts = new Map<string, number>();

function count(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (url.pathname === "/__fixture/requests") {
    if (url.searchParams.get("reset") === "1") {
      requestCounts.clear();
      bodyCounts.clear();
    }
    response.writeHead(200, { "content-type": "application/json" });
    // `requests` counts every read including a revalidation; `bodies` counts
    // only the 200s that actually transferred a payload. The difference is what
    // separates "read again" from "cached under a second key".
    response.end(
      JSON.stringify({
        requests: Object.fromEntries(requestCounts),
        bodies: Object.fromEntries(bodyCounts),
      })
    );
    return;
  }

  if (url.pathname === "/__fixture/fail") {
    failing = url.searchParams.get("value") !== "0";
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(failing ? "failing" : "healthy");
    return;
  }

  const match = /^\/api\/v1\/public\/(en|fa)\/(.+)$/.exec(url.pathname);
  if (match === null) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
    return;
  }

  if (failing) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "fixture outage" }));
    return;
  }

  const locale = match[1] as "en" | "fa";
  const key = `${locale}/${decodeURIComponent(match[2])}`;
  count(requestCounts, key);
  const envelope = await resolve(locale, match[2]);

  if (envelope === undefined) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: "not found",
        meta: { availableTranslations: [] },
      })
    );
    return;
  }

  const body = JSON.stringify(envelope);
  // A real ETag, because the client refuses a response without one and
  // revalidates with `if-none-match` on the next read.
  const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;

  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, { etag });
    response.end();
    return;
  }

  count(bodyCounts, key);
  response.writeHead(200, {
    "content-type": "application/json",
    etag,
    "cache-control": "public, max-age=0, must-revalidate",
  });
  response.end(body);
}

const port = Number(process.env.FIXTURE_API_PORT ?? 4210);

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "error",
      })
    );
  });
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`fixture public API listening on ${port}\n`);
});
