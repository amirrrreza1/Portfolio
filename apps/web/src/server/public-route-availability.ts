import type { PublicTaxonomyKind } from "@portfolio/contracts/blog";
import { slugSchemaFor, type Locale } from "@portfolio/contracts/common";
import { publicProjectSlugSchema } from "@portfolio/contracts/portfolio";

import {
  createPublicAppearanceClient,
  createPublicArticleDetailClient,
  createPublicArticleListClient,
  createPublicArticleTaxonomyClient,
  createPublicHomeClient,
  createPublicProjectDetailClient,
  createPublicProjectsClient,
  createPublicSiteClient,
  PublicApiResponseError,
  PublicDataUnavailableError,
  type PublicReadCache,
} from "./public-api-client";

type PublicRouteResource =
  | "home"
  | "projects"
  | "project-detail"
  | "articles"
  | "article-detail"
  | "article-taxonomy";

export type PublicRouteRequirement =
  | {
      readonly locale: Locale;
      readonly resource: "home";
    }
  | {
      readonly locale: Locale;
      readonly resource: "projects";
    }
  | {
      readonly locale: Locale;
      readonly resource: "articles";
    }
  | {
      readonly locale: Locale;
      readonly resource: "project-detail" | "article-detail";
      readonly slug: string;
    }
  | {
      readonly locale: Locale;
      readonly resource: "article-taxonomy";
      readonly kind: PublicTaxonomyKind;
      readonly slug: string;
    };

export type PublicRouteAvailability = "available" | "unavailable" | "not-found";

export interface PublicRouteAvailabilityReaders {
  readonly readAppearance: (locale: Locale) => Promise<unknown>;
  readonly readSite: (locale: Locale) => Promise<unknown>;
  readonly readHome: (locale: Locale) => Promise<unknown>;
  readonly readProjects: (locale: Locale) => Promise<unknown>;
  readonly readArticles: (locale: Locale) => Promise<unknown>;
  readonly readProjectDetail: (
    locale: Locale,
    slug: string
  ) => Promise<unknown>;
  readonly readArticleDetail: (
    locale: Locale,
    slug: string
  ) => Promise<unknown>;
  readonly readArticleTaxonomy: (
    locale: Locale,
    kind: PublicTaxonomyKind,
    slug: string
  ) => Promise<unknown>;
}

export interface PublicRouteAvailabilityClientOptions {
  readonly apiOrigin: string;
  readonly fetch?: typeof fetch;
  readonly cache?: PublicReadCache;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly maxStaleMs?: number;
  readonly reuseFresh?: boolean;
  readonly onStale?: (event: {
    readonly key: string;
    readonly ageMs: number;
  }) => void;
}

interface PendingRead {
  readonly kind: "appearance" | "site" | PublicRouteResource;
  readonly promise: Promise<unknown>;
}

/**
 * Only real public document routes are gated. Unknown paths retain their 404,
 * and malformed project slugs are left to the route's canonical 404 handling.
 */
export function classifyPublicRoute(
  pathname: string
): PublicRouteRequirement | null {
  const home = /^\/(en|fa)$/.exec(pathname);
  if (home) return { locale: home[1] as Locale, resource: "home" };

  const projects = /^\/(en|fa)\/projects$/.exec(pathname);
  if (projects) return { locale: projects[1] as Locale, resource: "projects" };

  const articles = /^\/(en|fa)\/blog$/.exec(pathname);
  if (articles) return { locale: articles[1] as Locale, resource: "articles" };

  // Before the article-detail pattern: `category` and `tag` are static
  // segments under `/blog`, and Next resolves them ahead of `[slug]`, so the
  // gate has to agree with the router about which route a path names.
  const taxonomy = /^\/(en|fa)\/blog\/(category|tag)\/([^/]+)$/.exec(pathname);
  if (taxonomy) {
    const locale = taxonomy[1] as Locale;
    let decodedSlug: string;
    try {
      decodedSlug = decodeURIComponent(taxonomy[3] ?? "");
    } catch {
      return null;
    }
    const slug = slugSchemaFor(locale).safeParse(decodedSlug);
    if (!slug.success) return null;
    return {
      locale,
      resource: "article-taxonomy",
      kind: taxonomy[2] === "category" ? "category" : "tag",
      slug: slug.data,
    };
  }

  const articleDetail = /^\/(en|fa)\/blog\/([^/]+)$/.exec(pathname);
  if (articleDetail) {
    const locale = articleDetail[1] as Locale;
    let decodedSlug: string;
    try {
      decodedSlug = decodeURIComponent(articleDetail[2] ?? "");
    } catch {
      return null;
    }
    const slug = slugSchemaFor(locale).safeParse(decodedSlug);
    if (!slug.success) return null;
    return { locale, resource: "article-detail", slug: slug.data };
  }

  const detail = /^\/(en|fa)\/projects\/([^/]+)$/.exec(pathname);
  if (!detail) return null;

  let decodedSlug: string;
  try {
    decodedSlug = decodeURIComponent(detail[2] ?? "");
  } catch {
    return null;
  }
  const slug = publicProjectSlugSchema.safeParse(decodedSlug);
  if (!slug.success) return null;

  return {
    locale: detail[1] as Locale,
    resource: "project-detail",
    slug: slug.data,
  };
}

export async function evaluatePublicRouteAvailability(
  requirement: PublicRouteRequirement,
  readers: PublicRouteAvailabilityReaders
): Promise<PublicRouteAvailability> {
  const pending: PendingRead[] = [
    {
      kind: "appearance",
      promise: readers.readAppearance(requirement.locale),
    },
    { kind: "site", promise: readers.readSite(requirement.locale) },
  ];

  if (requirement.resource === "home") {
    pending.push({
      kind: "home",
      promise: readers.readHome(requirement.locale),
    });
    pending.push({
      kind: "projects",
      promise: readers.readProjects(requirement.locale),
    });
  } else if (requirement.resource === "projects") {
    pending.push({
      kind: "projects",
      promise: readers.readProjects(requirement.locale),
    });
  } else if (requirement.resource === "articles") {
    pending.push({
      kind: "articles",
      promise: readers.readArticles(requirement.locale),
    });
  } else if (requirement.resource === "project-detail") {
    pending.push({
      kind: "project-detail",
      promise: readers.readProjectDetail(requirement.locale, requirement.slug),
    });
  } else if (requirement.resource === "article-taxonomy") {
    pending.push({
      kind: "article-taxonomy",
      promise: readers.readArticleTaxonomy(
        requirement.locale,
        requirement.kind,
        requirement.slug
      ),
    });
  } else {
    pending.push({
      kind: "article-detail",
      promise: readers.readArticleDetail(requirement.locale, requirement.slug),
    });
  }

  const results = await Promise.allSettled(
    pending.map(({ promise }) => promise)
  );
  let unavailable = false;
  let notFound = false;

  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") continue;
    const failedRead = pending[index];
    const error: unknown = result.reason;

    // Missing public content is a canonical 404, not a dependency outage.
    if (
      failedRead?.kind === "article-taxonomy" &&
      error instanceof PublicApiResponseError &&
      error.status === 404
    ) {
      notFound = true;
      continue;
    }
    if (
      (failedRead?.kind === "project-detail" ||
        failedRead?.kind === "article-detail") &&
      error instanceof PublicApiResponseError &&
      error.status === 404
    ) {
      continue;
    }
    if (error instanceof PublicDataUnavailableError) {
      unavailable = true;
      continue;
    }
    throw error;
  }

  if (unavailable) return "unavailable";
  return notFound ? "not-found" : "available";
}

export function createPublicRouteAvailabilityChecker(
  options: PublicRouteAvailabilityClientOptions
): (pathname: string) => Promise<PublicRouteAvailability> {
  const clientOptions = {
    ...options,
    onStale:
      options.onStale ??
      (({ key, ageMs }: { readonly key: string; readonly ageMs: number }) => {
        console.warn("Serving last-known-good public data during route gate", {
          key,
          ageMs,
        });
      }),
  };
  const readAppearance = createPublicAppearanceClient(clientOptions);
  const readSite = createPublicSiteClient(clientOptions);
  const readHome = createPublicHomeClient(clientOptions);
  const readProjects = createPublicProjectsClient(clientOptions);
  const readProjectDetail = createPublicProjectDetailClient(clientOptions);
  const readArticles = createPublicArticleListClient(clientOptions);
  const readArticleDetail = createPublicArticleDetailClient(clientOptions);
  const readArticleTaxonomy = createPublicArticleTaxonomyClient(clientOptions);

  return async (pathname) => {
    const requirement = classifyPublicRoute(pathname);
    if (requirement === null) return "available";
    return evaluatePublicRouteAvailability(requirement, {
      readAppearance,
      readSite,
      readHome,
      readProjects,
      readProjectDetail,
      readArticles: (locale) => readArticles(locale, { limit: 20 }),
      readArticleDetail,
      readArticleTaxonomy: (locale, kind, slug) =>
        readArticleTaxonomy(locale, kind, slug, { limit: 20 }),
    });
  };
}

let defaultOrigin: string | undefined;
let defaultChecker:
  ((pathname: string) => Promise<PublicRouteAvailability>) | undefined;

export function checkDefaultPublicRouteAvailability(
  pathname: string
): Promise<PublicRouteAvailability> {
  const apiOrigin = process.env.API_INTERNAL_ORIGIN?.trim();
  if (!apiOrigin) throw new Error("API_INTERNAL_ORIGIN is required.");
  if (defaultChecker === undefined || defaultOrigin !== apiOrigin) {
    defaultOrigin = apiOrigin;
    // Proxy executes outside the React Cache Components render context, so it
    // cannot call a `use cache` function. Its lightweight availability gate
    // uses a five-minute process entry; the page render behind it uses the
    // shared tagged Next cache and remains the source of rendered data.
    defaultChecker = createPublicRouteAvailabilityChecker({
      apiOrigin,
      fetch: globalThis.fetch,
      reuseFresh: true,
    });
  }
  return defaultChecker(pathname);
}
