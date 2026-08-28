import {
  articleCacheTags,
  evaluateArticleChecklist,
  invalidationEventSchema,
  warningsSatisfied,
  type InvalidationEvent,
  type ArchiveTranslation,
  type Locale,
  type PublishChecklist,
  type PublishTranslation,
  type ScheduleTranslation,
  type UnpublishTranslation,
} from "@portfolio/contracts";
import { inspectArticleSource } from "@portfolio/markdown";
import { createHash, randomUUID } from "node:crypto";

/**
 * Editorial state transitions for one article translation.
 *
 * These are separate commands rather than one status patch, per
 * [API_SPEC.md](../../../docs/API_SPEC.md) §6. Each has different
 * preconditions, a different audit event, and a different cache-invalidation
 * urgency, and folding them into a diff-driven update would mean deriving all
 * of that from what changed — which is exactly the reasoning that is easiest
 * to get subtly wrong and hardest to test.
 *
 * Every transition here runs inside one transaction that writes the row, an
 * immutable revision, a redacted audit event, and a durable invalidation
 * outbox row together. A transition that committed without its invalidation
 * would leave a withdrawn article cached, which SECURITY.md treats as a
 * disclosure, not a staleness bug.
 */

export class ArticleTransitionRefusedError extends Error {
  public constructor(
    readonly code:
      | "NOT_FOUND"
      | "WRONG_STATE"
      | "CHECKLIST_BLOCKED"
      | "WARNINGS_UNACKNOWLEDGED"
      | "REDIRECT_LOOP",
    readonly detail: string,
    readonly checklist: PublishChecklist | null = null
  ) {
    super(detail);
    this.name = "ArticleTransitionRefusedError";
  }
}

/**
 * Derived from the event contract, never re-declared.
 *
 * The first version of this file spelled the union by hand and included an
 * `"archive"` value the contract does not have. TypeScript was satisfied —
 * the local type was internally consistent — and the mismatch only surfaced
 * when Zod parsed a real payload, inside a transaction, at the end of a live
 * archive. A hand-copied enum is a second source of truth that agrees with
 * the first right up until someone adds a case.
 */
export type InvalidationReason = InvalidationEvent["reason"];

export interface TransitionResult {
  readonly id: string;
  readonly postId: string;
  readonly locale: Locale;
  readonly status: string;
  readonly version: number;
  readonly publishedAt: string | null;
  readonly scheduledFor: string | null;
}

/**
 * Reads every fact the checklist needs about a stored translation.
 *
 * The body is inspected with `inspectArticleSource`, which reports rather than
 * throws — a translation can legitimately be stored in a state that would not
 * render, and the checklist's job is to say so in the author's language rather
 * than surface a parser exception.
 */
export async function gatherChecklistFacts(
  prisma: any,
  translation: any,
  siteOrigin: string | null
): Promise<PublishChecklist> {
  const body = translation.bodyMarkdown ?? "";
  const inspection =
    body.trim().length === 0
      ? {
          hasH1: false,
          visibleTextLength: 0,
          wordCount: 0,
          unsafeUrls: [] as readonly string[],
          internalUrls: [] as readonly string[],
        }
      : inspectArticleSource(body);

  const post = await prisma.post.findUnique({
    where: { id: translation.postId },
    select: {
      coverMediaId: true,
      category: { select: { key: true, enabled: true } },
      tags: { select: { tag: { select: { key: true, enabled: true } } } },
    },
  });

  const mediaIds = [post?.coverMediaId, translation.socialImageId].filter(
    (id: string | null | undefined): id is string =>
      typeof id === "string" && id.length > 0
  );
  const uniqueMediaIds = [...new Set(mediaIds)];
  const usableMedia =
    uniqueMediaIds.length === 0
      ? 0
      : await prisma.mediaAsset.count({
          where: {
            id: { in: uniqueMediaIds },
            kind: "IMAGE",
            processingState: "VERIFIED",
            visibility: "PUBLIC",
            archivedAt: null,
          },
        });

  const cover =
    post?.coverMediaId == null
      ? null
      : await prisma.mediaAsset.findUnique({
          where: { id: post.coverMediaId },
          select: { altText: true },
        });

  const slugTaken =
    (await prisma.postTranslation.count({
      where: {
        locale: translation.locale,
        slug: translation.slug,
        id: { not: translation.id },
      },
    })) > 0;

  const counterpart = await prisma.postTranslation.findFirst({
    where: {
      postId: translation.postId,
      locale: { not: translation.locale },
      status: "PUBLISHED",
      archivedAt: null,
    },
    select: { id: true },
  });

  return evaluateArticleChecklist({
    title: translation.title ?? "",
    excerpt: translation.excerpt,
    seoDescription: translation.seoDescription,
    canonicalUrl: translation.canonicalUrl,
    coverImageId: post?.coverMediaId ?? null,
    category: post?.category?.key ?? null,
    hasH1: inspection.hasH1,
    visibleTextLength: inspection.visibleTextLength,
    wordCount: inspection.wordCount,
    unsafeUrls: inspection.unsafeUrls,
    internalUrlCount: inspection.internalUrls.length,
    categoryKnown: post?.category?.enabled === true,
    unknownTags: (post?.tags ?? [])
      .filter((row: any) => row.tag?.enabled !== true)
      .map((row: any) => String(row.tag?.key ?? "")),
    mediaMissing: usableMedia !== uniqueMediaIds.length,
    coverAltTextMissing:
      post?.coverMediaId == null
        ? null
        : (cover?.altText ?? "").trim().length === 0,
    slugTaken,
    sourceIntegrityValid: digestMatches(translation),
    siteOrigin,
    counterpartPublished: counterpart !== null,
  });
}

/**
 * Whether the stored digest still describes the stored body.
 *
 * A row with no body at all fails this rather than passing vacuously. Those
 * are the legacy Git-index rows the ADR-015 migration deliberately did not
 * invent source for, and publishing one would put an article on the public
 * site whose source nobody can reproduce.
 */
export function digestMatches(translation: any): boolean {
  if (
    typeof translation.bodyMarkdown !== "string" ||
    typeof translation.bodySha256 !== "string" ||
    translation.bodyMarkdown.length === 0
  ) {
    return false;
  }
  return (
    createHash("sha256")
      .update(translation.bodyMarkdown, "utf8")
      .digest("hex") === translation.bodySha256
  );
}

export async function recordTransition(
  prisma: any,
  options: {
    readonly before: any;
    readonly after: any;
    readonly actorId: string | null;
    readonly eventType: string;
    readonly reason: InvalidationReason;
    readonly metadata: Record<string, unknown>;
    readonly now: Date;
  }
): Promise<void> {
  const { after, before, actorId, eventType, reason, metadata, now } = options;
  await prisma.contentRevision.create({
    data: {
      entityType: "PostTranslation",
      entityId: after.id,
      entityVersion: after.version,
      action: "UPDATE",
      actorId,
      before: revisionSnapshot(before),
      after: revisionSnapshot(after),
    },
  });
  const tags = articleCacheTags({ locale: after.locale, slug: after.slug });
  await prisma.contentInvalidationOutbox.create({
    data: {
      cacheTag: tags[0] ?? "",
      payload: invalidationEventSchema.parse({
        eventId: randomUUID(),
        locale: after.locale,
        reason,
        tags,
        issuedAt: now.toISOString(),
      }),
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorId,
      eventType,
      targetType: "PostTranslation",
      targetId: after.id,
      outcome: "SUCCESS",
      metadata: { locale: after.locale, version: after.version, ...metadata },
    },
  });
}

/**
 * The revision body deliberately excludes the reason a transition was made.
 *
 * A reason is operator context — "withdrawn pending legal review" — and
 * belongs in the audit trail, which is redacted and access-controlled as a
 * unit. Copying it into the content revision would put it on the restore path,
 * where it would eventually be shown as though it were part of the article.
 */
export function revisionSnapshot(value: any) {
  return {
    postId: value.postId,
    locale: value.locale,
    title: value.title,
    slug: value.slug,
    excerpt: value.excerpt,
    status: value.status,
    bodyMarkdown: value.bodyMarkdown,
    bodySha256: value.bodySha256,
    renderedHtml: value.renderedHtml,
    rendererVersion: value.rendererVersion,
    version: value.version,
  };
}

export function transitionResult(row: any): TransitionResult {
  return {
    id: row.id,
    postId: row.postId,
    locale: row.locale,
    status: row.status,
    version: row.version,
    publishedAt:
      row.publishedAt === null ? null : row.publishedAt.toISOString(),
    scheduledFor:
      row.scheduledFor === null ? null : row.scheduledFor.toISOString(),
  };
}

/**
 * Applies a version-guarded update and returns the row it produced.
 *
 * `updateMany` with the version in the `where` is what makes the check atomic:
 * a read-then-write would leave a window in which another session commits
 * between the two statements and this one overwrites it anyway.
 */
export async function updateGuarded(
  prisma: any,
  id: string,
  version: number,
  data: Record<string, unknown>,
  conflict: () => never
): Promise<any> {
  const changed = await prisma.postTranslation.updateMany({
    where: { id, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (changed.count !== 1) conflict();
  return prisma.postTranslation.findUniqueOrThrow({ where: { id } });
}

export function assertPublishable(
  checklist: PublishChecklist,
  command: PublishTranslation | ScheduleTranslation
): void {
  if (checklist.blockers.length > 0) {
    throw new ArticleTransitionRefusedError(
      "CHECKLIST_BLOCKED",
      `The publish checklist has unresolved blockers: ${checklist.blockers.join(", ")}.`,
      checklist
    );
  }
  if (!warningsSatisfied(checklist, command.acknowledgedWarnings)) {
    throw new ArticleTransitionRefusedError(
      "WARNINGS_UNACKNOWLEDGED",
      "Every checklist warning must be acknowledged explicitly.",
      checklist
    );
  }
}

/**
 * Records that a path moved, collapsing any chain that would form.
 *
 * The schema forbids a redirect to itself and the model comment requires
 * chains to collapse. Both matter for the same reason: a chain costs a visitor
 * an extra round trip per hop and search engines stop following after a few,
 * so `/a → /b` followed by `/b → /c` must become `/a → /c` and `/b → /c`
 * rather than two hops. A move back to a path that already redirects away is
 * the loop case, and it deletes the stale rule instead of creating a cycle.
 */
export async function recordSlugMove(
  prisma: any,
  options: {
    readonly locale: Locale;
    readonly fromPath: string;
    readonly toPath: string;
    readonly translationId: string;
    readonly actorId: string | null;
  }
): Promise<void> {
  const { locale, fromPath, toPath, translationId, actorId } = options;
  if (fromPath === toPath) return;

  // Anything that pointed at the old path now points at the new one, so no
  // visitor is ever asked to make two hops.
  await prisma.slugRedirect.updateMany({
    where: { locale, toPath: fromPath },
    data: { toPath },
  });
  // The destination must not itself redirect away, or the move creates a loop.
  await prisma.slugRedirect.deleteMany({ where: { locale, fromPath: toPath } });

  await prisma.slugRedirect.upsert({
    where: { locale_fromPath: { locale, fromPath } },
    update: { toPath, sourceEntityId: translationId, createdById: actorId },
    create: {
      locale,
      fromPath,
      toPath,
      statusCode: 308,
      sourceEntityType: "PostTranslation",
      sourceEntityId: translationId,
      createdById: actorId,
    },
  });
}

export function articlePathFor(locale: Locale, slug: string): string {
  return `/${locale}/blog/${slug}`;
}

export type {
  ArchiveTranslation,
  PublishTranslation,
  ScheduleTranslation,
  UnpublishTranslation,
};
