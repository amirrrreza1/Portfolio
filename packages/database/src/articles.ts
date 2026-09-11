import {
  archiveTranslationSchema,
  articleCacheTags,
  autosaveDraftSchema,
  frontmatterSchema,
  invalidationEventSchema,
  publishTranslationSchema,
  saveTranslationSchema,
  scheduleTranslationSchema,
  unpublishTranslationSchema,
  type AutosaveDraft,
  type Frontmatter,
  type Locale,
  type PublishChecklist,
  type SaveTranslation,
} from "@portfolio/contracts";
import { renderArticleBody } from "@portfolio/markdown";
import { createHash, randomUUID } from "node:crypto";

import {
  ArticleTransitionRefusedError,
  articlePathFor,
  assertPublishable,
  gatherChecklistFacts,
  recordSlugMove,
  recordTransition,
  revisionSnapshot,
  transitionResult,
  updateGuarded,
  type ArchiveTranslation,
  type PublishTranslation,
  type ScheduleTranslation,
  type TransitionResult,
  type UnpublishTranslation,
} from "./article-lifecycle.js";
import type { Database } from "./client.js";
import type { ContentJobStore } from "./content-jobs.js";

export class ArticleVersionConflictError extends Error {
  public constructor(
    readonly expectedVersion: number | null,
    readonly currentVersion: number | null
  ) {
    super("The article translation changed after this edit began.");
    this.name = "ArticleVersionConflictError";
  }
}

/** Evidence context for a save that an editor did not type. */
export type ArticleSaveOrigin = {
  readonly kind: "restore";
  readonly revisionId: string;
  readonly revisionVersion: number;
};

export interface SavedArticleTranslation {
  readonly id: string;
  readonly postId: string;
  readonly locale: Locale;
  readonly version: number;
  readonly bodySha256: string;
  readonly rendererVersion: string;
}

/**
 * Server-only PostgreSQL article authority. Controllers must add the M6
 * authentication/authorization boundary before exposing this repository.
 */
export function createArticleStore(
  database: Database,
  /**
   * The site's own origin, used only to decide whether an article's canonical
   * URL points away from it. Passed in rather than read from settings inside
   * each transaction: the checklist is evaluated on every publish attempt, and
   * a settings read per attempt buys nothing over a value the caller already
   * has.
   */
  siteOrigin: string | null = null
) {
  return {
    saveTranslation: async (
      command: SaveTranslation,
      actorId: string | null,
      /**
       * Why this save is happening, when it is not an author pressing save.
       *
       * A restore is the same write — validate, render, digest, revise,
       * invalidate — and giving it its own transaction would mean two code
       * paths that must stay identical forever. What differs is only the
       * evidence it leaves, so that is all this changes.
       */
      origin: ArticleSaveOrigin | null = null
    ): Promise<SavedArticleTranslation> => {
      const input = saveTranslationSchema.parse(command);
      const frontmatter = frontmatterSchema.parse(input.frontmatter);
      const body = normalizeBody(input.body);
      const rendered = await renderArticleBody(body);
      const bodySha256 = createHash("sha256")
        .update(body, "utf8")
        .digest("hex");

      return database.$transaction(async (prisma: any) => {
        const existing = await prisma.postTranslation.findUnique({
          where: {
            postId_locale: {
              postId: frontmatter.postId,
              locale: frontmatter.locale,
            },
          },
        });
        const currentVersion = existing?.version ?? null;
        if (currentVersion !== input.baseVersion) {
          throw new ArticleVersionConflictError(
            input.baseVersion,
            currentVersion
          );
        }

        const taxonomy = await resolveTaxonomy(prisma, frontmatter);
        await assertMedia(prisma, frontmatter);
        await prisma.post.upsert({
          where: { id: frontmatter.postId },
          update: {
            categoryId: taxonomy.categoryId,
            coverMediaId: frontmatter.coverImage,
          },
          create: {
            id: frontmatter.postId,
            authorId: actorId,
            categoryId: taxonomy.categoryId,
            coverMediaId: frontmatter.coverImage,
          },
        });
        await prisma.postTag.deleteMany({
          where: { postId: frontmatter.postId },
        });
        if (taxonomy.tagIds.length > 0) {
          await prisma.postTag.createMany({
            data: taxonomy.tagIds.map((tagId: string) => ({
              postId: frontmatter.postId,
              tagId,
            })),
          });
        }

        const data = translationData(frontmatter, body, bodySha256, rendered);
        const translation =
          existing === null
            ? await prisma.postTranslation.create({
                data: {
                  postId: frontmatter.postId,
                  locale: frontmatter.locale,
                  ...data,
                },
              })
            : await updateExisting(
                prisma,
                existing.id,
                input.baseVersion!,
                data
              );

        await prisma.contentRevision.create({
          data: {
            entityType: "PostTranslation",
            entityId: translation.id,
            entityVersion: translation.version,
            action:
              existing === null
                ? "CREATE"
                : origin?.kind === "restore"
                  ? "RESTORE"
                  : "UPDATE",
            actorId,
            before: existing === null ? undefined : revisionSnapshot(existing),
            after: revisionSnapshot(translation),
          },
        });
        await prisma.auditEvent.create({
          data: {
            actorId,
            eventType:
              origin?.kind === "restore"
                ? "article.translation.restored"
                : "article.translation.saved",
            targetType: "PostTranslation",
            targetId: translation.id,
            outcome: "SUCCESS",
            metadata: {
              locale: frontmatter.locale,
              version: translation.version,
              ...(origin?.kind === "restore"
                ? {
                    restoredFromRevisionId: origin.revisionId,
                    restoredFromVersion: origin.revisionVersion,
                  }
                : {}),
            },
          },
        });

        const tags = articleCacheTags({
          locale: frontmatter.locale,
          slug: frontmatter.slug,
        });
        const event = invalidationEventSchema.parse({
          eventId: randomUUID(),
          locale: frontmatter.locale,
          reason: frontmatter.status === "published" ? "publish" : "save",
          tags,
          issuedAt: new Date().toISOString(),
        });
        await prisma.contentInvalidationOutbox.create({
          data: { cacheTag: tags[0] ?? "", payload: event },
        });
        // A published slug that changes leaves every existing link pointing at
        // a path that no longer resolves. The redirect is written in the same
        // transaction as the change that caused it, so there is no window in
        // which the old URL is simply gone.
        if (existing !== null && existing.slug !== translation.slug) {
          await recordSlugMove(prisma, {
            locale: frontmatter.locale,
            fromPath: articlePathFor(frontmatter.locale, existing.slug),
            toPath: articlePathFor(frontmatter.locale, translation.slug),
            translationId: translation.id,
            actorId,
          });
        }
        if (actorId !== null) {
          await prisma.postDraft.deleteMany({
            where: {
              postId: frontmatter.postId,
              locale: frontmatter.locale,
              authorId: actorId,
            },
          });
        }

        return {
          id: translation.id,
          postId: translation.postId,
          locale: translation.locale,
          version: translation.version,
          bodySha256: translation.bodySha256,
          rendererVersion: translation.rendererVersion,
        };
      });
    },

    /**
     * The editor's read: everything needed to reopen a translation, including
     * a newer autosave if one exists.
     *
     * The draft is returned beside the committed body rather than merged into
     * it. Merging would mean the editor could not tell the author what they
     * are looking at, and "your unsaved work was silently applied" is the one
     * outcome an autosave must never produce.
     */
    readTranslation: async (
      postId: string,
      locale: Locale,
      actorId: string | null
    ) => {
      const translation = await database.postTranslation.findUnique({
        where: { postId_locale: { postId, locale } },
        include: {
          post: {
            select: {
              featured: true,
              coverMediaId: true,
              coverMedia: { select: { altText: true } },
              category: { select: { key: true } },
              tags: { select: { tag: { select: { key: true } } } },
            },
          },
        },
      });
      if (translation === null) return null;
      const draft =
        actorId === null
          ? null
          : await database.postDraft.findUnique({
              where: {
                postId_locale_authorId: { postId, locale, authorId: actorId },
              },
              select: {
                bodyMarkdown: true,
                frontmatter: true,
                baseVersion: true,
                updatedAt: true,
              },
            });
      return {
        id: translation.id,
        postId: translation.postId,
        locale: translation.locale,
        title: translation.title,
        slug: translation.slug,
        excerpt: translation.excerpt,
        seoTitle: translation.seoTitle,
        seoDescription: translation.seoDescription,
        canonicalUrl: translation.canonicalUrl,
        socialImageId: translation.socialImageId,
        status: translation.status,
        publishedAt: translation.publishedAt,
        scheduledFor: translation.scheduledFor,
        bodyMarkdown: translation.bodyMarkdown,
        bodySha256: translation.bodySha256,
        rendererVersion: translation.rendererVersion,
        readingMinutes: translation.readingMinutes,
        version: translation.version,
        archivedAt: translation.archivedAt,
        category: translation.post.category?.key ?? null,
        tags: translation.post.tags.map((row) => row.tag.key),
        coverImage: translation.post.coverMediaId,
        coverImageAlt: translation.post.coverMedia?.altText ?? null,
        featured: translation.post.featured,
        /**
         * Whether the autosave is ahead of the committed row, rather than the
         * raw timestamps. The editor needs a decision, and computing it in two
         * places is how the two eventually disagree.
         */
        draft:
          draft === null
            ? null
            : {
                bodyMarkdown: draft.bodyMarkdown,
                frontmatter: draft.frontmatter,
                baseVersion: draft.baseVersion,
                updatedAt: draft.updatedAt,
                aheadOfSave: draft.updatedAt > translation.updatedAt,
              },
      };
    },

    /**
     * The publish checklist for a stored translation, with no side effects.
     *
     * Exposed separately so the editor can show what would block a publish
     * before the author commits to one. Publishing re-evaluates it inside its
     * own transaction rather than trusting this result, because anything read
     * here can change before the command arrives.
     */
    checklistFor: async (
      postId: string,
      locale: Locale
    ): Promise<PublishChecklist | null> => {
      const translation = await database.postTranslation.findUnique({
        where: { postId_locale: { postId, locale } },
      });
      if (translation === null) return null;
      return gatherChecklistFacts(database, translation, siteOrigin);
    },

    /**
     * Autosave. Writes `PostDraft` and nothing else.
     *
     * No version check, by design: a conflict raised here would interrupt
     * typing, and the draft is scoped to one author so there is nothing to
     * conflict with. `baseVersion` is recorded rather than enforced, so a
     * later save can show the author a diff instead of a bare refusal.
     */
    autosaveDraft: async (
      postId: string,
      locale: Locale,
      actorId: string,
      command: AutosaveDraft
    ) => {
      const input = autosaveDraftSchema.parse(command);
      const saved = await database.postDraft.upsert({
        where: {
          postId_locale_authorId: { postId, locale, authorId: actorId },
        },
        update: {
          bodyMarkdown: input.body,
          frontmatter: (input.frontmatter ?? null) as never,
          baseVersion: input.baseVersion,
        },
        create: {
          postId,
          locale,
          authorId: actorId,
          bodyMarkdown: input.body,
          frontmatter: (input.frontmatter ?? null) as never,
          baseVersion: input.baseVersion,
        },
        select: { updatedAt: true, baseVersion: true },
      });
      return { savedAt: saved.updatedAt, baseVersion: saved.baseVersion };
    },

    publishTranslation: async (
      postId: string,
      locale: Locale,
      actorId: string | null,
      command: PublishTranslation,
      now: Date = new Date()
    ): Promise<TransitionResult> => {
      const input = publishTranslationSchema.parse(command);
      return database.$transaction(async (prisma: any) => {
        const before = await requireTranslation(prisma, postId, locale);
        if (before.status === "PUBLISHED") {
          throw new ArticleTransitionRefusedError(
            "WRONG_STATE",
            "This translation is already published."
          );
        }
        assertPublishable(
          await gatherChecklistFacts(prisma, before, siteOrigin),
          input
        );
        const after = await updateGuarded(
          prisma,
          before.id,
          input.version,
          {
            status: "PUBLISHED",
            // The server's clock, never the client's. A caller-supplied time
            // is either redundant or a way to backdate past the audit trail.
            publishedAt: before.publishedAt ?? now,
            scheduledFor: null,
            archivedAt: null,
          },
          () => {
            throw new ArticleVersionConflictError(input.version, null);
          }
        );
        await recordTransition(prisma, {
          before,
          after,
          actorId,
          eventType: "article.translation.published",
          reason: "publish",
          metadata: { acknowledgedWarnings: input.acknowledgedWarnings },
          now,
        });
        return transitionResult(after);
      });
    },

    scheduleTranslation: async (
      postId: string,
      locale: Locale,
      actorId: string | null,
      command: ScheduleTranslation,
      now: Date = new Date()
    ): Promise<TransitionResult> => {
      const input = scheduleTranslationSchema.parse(command);
      return database.$transaction(async (prisma: any) => {
        const before = await requireTranslation(prisma, postId, locale);
        if (before.status === "PUBLISHED") {
          throw new ArticleTransitionRefusedError(
            "WRONG_STATE",
            "Unpublish before scheduling a published translation."
          );
        }
        // The scheduler will publish this without asking again, so the
        // checklist is enforced now. A scheduled article that fails its own
        // checklist at fire time would either publish something broken or fail
        // silently in a worker at 3am.
        assertPublishable(
          await gatherChecklistFacts(prisma, before, siteOrigin),
          input
        );
        const after = await updateGuarded(
          prisma,
          before.id,
          input.version,
          {
            status: "SCHEDULED",
            scheduledFor: new Date(input.scheduledFor),
            archivedAt: null,
          },
          () => {
            throw new ArticleVersionConflictError(input.version, null);
          }
        );
        await recordTransition(prisma, {
          before,
          after,
          actorId,
          eventType: "article.translation.scheduled",
          reason: "save",
          metadata: { scheduledFor: input.scheduledFor },
          now,
        });
        return transitionResult(after);
      });
    },

    unpublishTranslation: async (
      postId: string,
      locale: Locale,
      actorId: string | null,
      command: UnpublishTranslation,
      now: Date = new Date()
    ): Promise<TransitionResult> => {
      const input = unpublishTranslationSchema.parse(command);
      return database.$transaction(async (prisma: any) => {
        const before = await requireTranslation(prisma, postId, locale);
        if (before.status !== "PUBLISHED" && before.status !== "SCHEDULED") {
          throw new ArticleTransitionRefusedError(
            "WRONG_STATE",
            "Only a published or scheduled translation can be withdrawn."
          );
        }
        const after = await updateGuarded(
          prisma,
          before.id,
          input.version,
          { status: "DRAFT", publishedAt: null, scheduledFor: null },
          () => {
            throw new ArticleVersionConflictError(input.version, null);
          }
        );
        await recordTransition(prisma, {
          before,
          after,
          actorId,
          eventType: "article.translation.unpublished",
          reason: "unpublish",
          metadata: { reason: input.reason },
          now,
        });
        return transitionResult(after);
      });
    },

    /**
     * Archive: the article stops being public and its URL stops resolving.
     *
     * `redirectTo` is required to be a deliberate choice rather than a
     * default. Archiving without one leaves the path to answer `410 Gone`,
     * which is the honest response for something withdrawn on purpose;
     * silently redirecting everything to the blog index would tell a visitor
     * the article never existed.
     */
    archiveTranslation: async (
      postId: string,
      locale: Locale,
      actorId: string | null,
      command: ArchiveTranslation,
      now: Date = new Date()
    ): Promise<TransitionResult> => {
      const input = archiveTranslationSchema.parse(command);
      return database.$transaction(async (prisma: any) => {
        const before = await requireTranslation(prisma, postId, locale);
        if (before.status === "PUBLISHED") {
          throw new ArticleTransitionRefusedError(
            "WRONG_STATE",
            "Withdraw a published translation before archiving it."
          );
        }
        const fromPath = articlePathFor(locale, before.slug);
        if (input.redirectTo !== null && input.redirectTo === fromPath) {
          throw new ArticleTransitionRefusedError(
            "REDIRECT_LOOP",
            "An archived path cannot redirect to itself."
          );
        }
        const after = await updateGuarded(
          prisma,
          before.id,
          input.version,
          {
            status: "ARCHIVED",
            publishedAt: null,
            scheduledFor: null,
            archivedAt: now,
          },
          () => {
            throw new ArticleVersionConflictError(input.version, null);
          }
        );
        if (input.redirectTo !== null) {
          await recordSlugMove(prisma, {
            locale,
            fromPath,
            toPath: input.redirectTo,
            translationId: after.id,
            actorId,
          });
        }
        await recordTransition(prisma, {
          before,
          after,
          actorId,
          eventType: "article.translation.archived",
          // Archiving has no cache behaviour of its own: the URL simply must
          // stop being served, which is what "unpublish" already means to
          // every reader of this payload. The distinction between withdrawing
          // and archiving is editorial, and it is carried by the audit event
          // beside this one rather than by inventing a purge reason the
          // signed-event contract does not have.
          reason: "unpublish",
          metadata: { reason: input.reason, redirectTo: input.redirectTo },
          now,
        });
        return transitionResult(after);
      });
    },
  };
}

async function requireTranslation(prisma: any, postId: string, locale: Locale) {
  const translation = await prisma.postTranslation.findUnique({
    where: { postId_locale: { postId, locale } },
  });
  if (translation === null) {
    throw new ArticleTransitionRefusedError(
      "NOT_FOUND",
      "No such article translation."
    );
  }
  return translation;
}

export async function enqueueDuePublications(
  database: Database,
  jobs: ContentJobStore,
  now = new Date()
): Promise<number> {
  const due = await database.postTranslation.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    select: { id: true },
    take: 100,
  });
  let queued = 0;
  for (const { id } of due) {
    const outcome = await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: `article:${id}`,
      dedupeKey: `publish:${id}`,
      payload: { translationId: id },
    });
    if (outcome === "queued") queued += 1;
  }
  return queued;
}

export async function publishDueTranslation(
  database: Database,
  translationId: string,
  now = new Date()
): Promise<"published" | "skipped"> {
  return database.$transaction(async (prisma: any) => {
    const current = await prisma.postTranslation.findUnique({
      where: { id: translationId },
    });
    if (
      current === null ||
      current.status !== "SCHEDULED" ||
      current.scheduledFor === null ||
      current.scheduledFor > now ||
      current.bodyMarkdown === null ||
      current.bodySha256 === null ||
      current.renderedHtml === null ||
      current.rendererVersion === null
    ) {
      return "skipped" as const;
    }
    const expectedDigest = createHash("sha256")
      .update(current.bodyMarkdown, "utf8")
      .digest("hex");
    if (expectedDigest !== current.bodySha256) {
      throw new Error("Scheduled article source integrity is invalid.");
    }
    const changed = await prisma.postTranslation.updateMany({
      where: {
        id: translationId,
        version: current.version,
        status: "SCHEDULED",
      },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        scheduledFor: null,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) return "skipped" as const;
    const published = await prisma.postTranslation.findUniqueOrThrow({
      where: { id: translationId },
    });
    await prisma.contentRevision.create({
      data: {
        entityType: "PostTranslation",
        entityId: translationId,
        entityVersion: published.version,
        action: "UPDATE",
        before: revisionSnapshot(current),
        after: revisionSnapshot(published),
      },
    });
    const tags = articleCacheTags({
      locale: published.locale,
      slug: published.slug,
    });
    const event = invalidationEventSchema.parse({
      eventId: randomUUID(),
      locale: published.locale,
      reason: "publish",
      tags,
      issuedAt: now.toISOString(),
    });
    await prisma.contentInvalidationOutbox.create({
      data: { cacheTag: tags[0] ?? "", payload: event },
    });
    await prisma.auditEvent.create({
      data: {
        eventType: "article.translation.published",
        targetType: "PostTranslation",
        targetId: translationId,
        outcome: "SUCCESS",
        metadata: { version: published.version },
      },
    });
    return "published" as const;
  });
}

async function updateExisting(
  prisma: any,
  id: string,
  version: number,
  data: Record<string, unknown>
) {
  const updated = await prisma.postTranslation.updateMany({
    where: { id, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (updated.count !== 1) {
    const current = await prisma.postTranslation.findUnique({
      where: { id },
      select: { version: true },
    });
    throw new ArticleVersionConflictError(version, current?.version ?? null);
  }
  return prisma.postTranslation.findUniqueOrThrow({ where: { id } });
}

function translationData(
  frontmatter: Frontmatter,
  bodyMarkdown: string,
  bodySha256: string,
  rendered: Awaited<ReturnType<typeof renderArticleBody>>
) {
  return {
    title: frontmatter.title,
    slug: frontmatter.slug,
    excerpt: frontmatter.excerpt,
    seoTitle: frontmatter.seoTitle,
    seoDescription: frontmatter.seoDescription,
    canonicalUrl: frontmatter.canonicalUrl,
    socialImageId: frontmatter.socialImage,
    status: frontmatter.status.toUpperCase(),
    publishedAt:
      frontmatter.publishedAt === null
        ? null
        : new Date(frontmatter.publishedAt),
    scheduledFor:
      frontmatter.scheduledFor === null
        ? null
        : new Date(frontmatter.scheduledFor),
    bodyMarkdown,
    bodySha256,
    readingMinutes: rendered.readingTimeMinutes,
    headingTree: rendered.headings,
    renderedHtml: rendered.html,
    rendererVersion: rendered.rendererVersion,
    frontmatterSchemaVersion: frontmatter.schemaVersion,
    archivedAt: frontmatter.status === "archived" ? new Date() : null,
  };
}

function normalizeBody(body: string): string {
  return body
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

async function resolveTaxonomy(prisma: any, frontmatter: Frontmatter) {
  const category =
    frontmatter.category === null
      ? null
      : await prisma.category.findUnique({
          where: { key: frontmatter.category },
          select: { id: true, enabled: true },
        });
  if (frontmatter.category !== null && category?.enabled !== true) {
    throw new Error(`Unknown or disabled category: ${frontmatter.category}`);
  }
  const tags = await prisma.tag.findMany({
    where: { key: { in: frontmatter.tags }, enabled: true },
    select: { id: true, key: true },
  });
  if (tags.length !== frontmatter.tags.length) {
    const found = new Set(tags.map((tag: any) => tag.key));
    const missing = frontmatter.tags.filter((key) => !found.has(key));
    throw new Error(`Unknown or disabled tags: ${missing.join(", ")}`);
  }
  return {
    categoryId: category?.id ?? null,
    tagIds: tags.map((tag: any) => tag.id),
  };
}

/**
 * Rejects a save whose cover or social image is not something a public page
 * may actually deliver.
 *
 * The predicate is the one the public read paths already use — verified,
 * public, not archived — rather than merely "the row exists". A quarantined or
 * private asset that passes here becomes a broken or leaking image on a
 * published article, and the save is the last place to catch it cheaply.
 */
async function assertMedia(prisma: any, frontmatter: Frontmatter) {
  const ids = [frontmatter.coverImage, frontmatter.socialImage].filter(
    (id) => id !== null
  );
  if (ids.length === 0) return;
  const count = await prisma.mediaAsset.count({
    where: {
      id: { in: [...new Set(ids)] },
      kind: "IMAGE",
      processingState: "VERIFIED",
      visibility: "PUBLIC",
      archivedAt: null,
    },
  });
  if (count !== new Set(ids).size)
    throw new Error("Referenced media is missing or unavailable.");
}

/**
 * `revisionSnapshot` lives in `article-lifecycle.ts` and is imported here.
 *
 * It used to exist twice, once per module, with identical bodies. Two copies
 * of the shape a revision records is one copy too many: M8 slice 4 needed to
 * add the SEO fields for restore to be faithful, and a second copy is exactly
 * where that addition would have been forgotten — leaving transitions and
 * saves writing snapshots that disagree about what an article is.
 */
