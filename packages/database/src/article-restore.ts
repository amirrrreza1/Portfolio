import {
  frontmatterSchema,
  type Frontmatter,
  type Locale,
} from "@portfolio/contracts";
import { createHash } from "node:crypto";

import {
  createArticleStore,
  type SavedArticleTranslation,
} from "./articles.js";
import type { Database } from "./client.js";

/**
 * Restoring one earlier version of an article translation.
 *
 * API_SPEC §6 gives revision restore a single endpoint — `POST
 * /admin/revisions/:id/restore` — and one rule: it writes a new revision and
 * never mutates history. M7 implemented that for every portfolio family by
 * replaying a snapshot through the same validated update the editor uses.
 * Articles cannot reuse M7's generic path, because an article is not a row of
 * fields: its stored form includes a render and a source digest that only the
 * Markdown pipeline may produce. Copying `renderedHtml` back out of a snapshot
 * would resurrect output from whatever renderer was current that day, and
 * copying `bodySha256` back would make the digest a claim rather than a check.
 *
 * So the article restore replays the snapshot's **source** through
 * `saveTranslation`, the same transaction an author's save runs: re-render,
 * re-digest, immutable revision, redacted audit event, durable invalidation,
 * and a `308` if the slug moved back. What history contributes is the text and
 * the metadata that were recorded; everything derived is derived again, now.
 */

export class ArticleRestoreRefusedError extends Error {
  public constructor(
    readonly code:
      | "NOT_AN_ARTICLE"
      | "NO_SNAPSHOT"
      | "SNAPSHOT_INVALID"
      | "TRANSLATION_MISSING"
      | "WRONG_STATE",
    readonly detail: string
  ) {
    super(detail);
    this.name = "ArticleRestoreRefusedError";
  }
}

export interface ArticleRevisionSnapshot {
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly canonicalUrl: string | null;
  readonly socialImageId: string | null;
  readonly frontmatterSchemaVersion: number;
  readonly status: string;
  readonly bodyMarkdown: string;
  readonly version: number;
}

export interface ArticleRestoreTarget {
  readonly revisionId: string;
  readonly translationId: string;
  readonly postId: string;
  readonly locale: Locale;
  readonly revisionVersion: number;
  readonly snapshot: ArticleRevisionSnapshot;
  /** The document the snapshot describes, ready to serialize or diff. */
  readonly frontmatter: Frontmatter;
  readonly body: string;
  /** The same document as the translation stands now, for an exact diff. */
  readonly currentFrontmatter: Frontmatter;
  readonly currentBody: string;
  readonly currentStatus: string;
  readonly currentVersion: number;
}

/**
 * Reads one revision and works out what restoring it would write.
 *
 * Separated from the write so the editor can show the author the exact
 * document and diff it is about to commit, evaluated by the same code that
 * would commit it. A "preview" computed by a second implementation is a
 * preview of something else.
 */
export async function readArticleRestoreTarget(
  database: Database,
  revisionId: string
): Promise<ArticleRestoreTarget> {
  const revision = await database.contentRevision.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      entityVersion: true,
      after: true,
    },
  });
  if (revision === null) {
    throw new ArticleRestoreRefusedError(
      "NOT_AN_ARTICLE",
      "No such content revision."
    );
  }
  if (revision.entityType !== "PostTranslation") {
    throw new ArticleRestoreRefusedError(
      "NOT_AN_ARTICLE",
      "This revision does not describe an article translation."
    );
  }
  const snapshot = parseArticleRevisionSnapshot(revision.after);

  const current = await database.postTranslation.findUnique({
    where: { id: revision.entityId },
    include: {
      post: {
        select: {
          category: { select: { key: true, enabled: true } },
          tags: { select: { tag: { select: { key: true, enabled: true } } } },
          coverMedia: { select: { id: true, altText: true } },
        },
      },
    },
  });
  if (current === null) {
    throw new ArticleRestoreRefusedError(
      "TRANSLATION_MISSING",
      "The translation this revision belongs to no longer exists."
    );
  }
  return {
    revisionId: revision.id,
    translationId: current.id,
    postId: current.postId,
    locale: current.locale as Locale,
    revisionVersion: revision.entityVersion,
    snapshot,
    frontmatter: buildRestoreFrontmatter(current, snapshot),
    body: snapshot.bodyMarkdown,
    currentFrontmatter: buildCurrentFrontmatter(current),
    currentBody: current.bodyMarkdown ?? "",
    currentStatus: current.status,
    currentVersion: current.version,
  };
}

/**
 * The document a restore would write.
 *
 * Two rules, and both are about not making a restore mean more than it says.
 *
 * **Lifecycle comes from today, never from the snapshot.** A revision records
 * the status the row had when it was written, and replaying that would let
 * "restore the text I had on Tuesday" publish a withdrawn article or withdraw
 * a live one. Publication is a command with a checklist, an audit event and a
 * cache consequence; it is not a side effect of editing prose. Import made the
 * same choice for the same reason.
 *
 * **Post-level taxonomy comes from today too**, because the category, tags and
 * cover belong to the post that both locales share. A per-locale restore that
 * rewrote them would reach across the language boundary.
 */
export function buildRestoreFrontmatter(
  current: any,
  snapshot: ArticleRevisionSnapshot
): Frontmatter {
  return frontmatterSchema.parse({
    schemaVersion: snapshot.frontmatterSchemaVersion,
    postId: current.postId,
    locale: current.locale,
    title: snapshot.title,
    slug: snapshot.slug,
    excerpt: snapshot.excerpt ?? current.excerpt,
    status: String(current.status).toLowerCase(),
    publishedAt: current.publishedAt?.toISOString() ?? null,
    scheduledFor: current.scheduledFor?.toISOString() ?? null,
    updatedAt: null,
    category: current.post?.category?.key ?? null,
    tags: (current.post?.tags ?? []).map((row: any) => row.tag.key),
    coverImage: current.post?.coverMedia?.id ?? null,
    coverImageAlt: current.post?.coverMedia?.altText ?? null,
    seoTitle: snapshot.seoTitle,
    seoDescription: snapshot.seoDescription,
    canonicalUrl: snapshot.canonicalUrl,
    socialImage: snapshot.socialImageId,
    translationOf: null,
  });
}

/** The document as the translation stands right now, for diffing against. */
export function buildCurrentFrontmatter(current: any): Frontmatter {
  return buildRestoreFrontmatter(current, {
    title: current.title,
    slug: current.slug,
    excerpt: current.excerpt,
    seoTitle: current.seoTitle,
    seoDescription: current.seoDescription,
    canonicalUrl: current.canonicalUrl,
    socialImageId: current.socialImageId,
    frontmatterSchemaVersion: current.frontmatterSchemaVersion ?? 1,
    status: current.status,
    bodyMarkdown: current.bodyMarkdown ?? "",
    version: current.version,
  });
}

export async function restoreArticleRevision(
  database: Database,
  options: {
    readonly revisionId: string;
    readonly actorId: string | null;
    readonly siteOrigin?: string | null;
  }
): Promise<
  SavedArticleTranslation & {
    readonly restoredFromRevisionId: string;
    readonly restoredFromVersion: number;
  }
> {
  const target = await readArticleRestoreTarget(database, options.revisionId);
  /**
   * Archived is the one state a restore may not write into.
   *
   * `archivedAt` is set by the save path from the frontmatter status, so
   * replaying a snapshot onto an archived row would stamp today's date on a
   * withdrawal that happened weeks ago and quietly re-date the evidence. An
   * archived article is restored by unarchiving it first, which is an
   * editorial decision with its own audited command. Reading that article's
   * history stays allowed — this refusal belongs to the write, not the view.
   */
  if (target.currentStatus === "ARCHIVED") {
    throw new ArticleRestoreRefusedError(
      "WRONG_STATE",
      "Unarchive this translation before restoring an earlier version."
    );
  }
  const store = createArticleStore(database, options.siteOrigin ?? null);
  const saved = await store.saveTranslation(
    {
      frontmatter: target.frontmatter,
      body: target.body,
      /**
       * The version read a moment ago, which the save re-checks inside its own
       * transaction with `updateMany ... where version`. If anything commits
       * in between, that guard raises the same conflict an author's stale save
       * raises — a restore is not a licence to overwrite someone else's edit.
       */
      baseVersion: target.currentVersion,
    },
    options.actorId,
    {
      kind: "restore",
      revisionId: target.revisionId,
      revisionVersion: target.revisionVersion,
    }
  );
  return {
    ...saved,
    restoredFromRevisionId: target.revisionId,
    restoredFromVersion: target.revisionVersion,
  };
}

/**
 * Validates that a snapshot still describes something restorable.
 *
 * The digest check is the important one. A revision carries both the source
 * and the digest that was computed from it, and if they disagree the row was
 * altered outside the write path — so the honest answer is a refusal, not a
 * restore that silently recomputes the digest and makes the tampered text
 * authoritative.
 */
export function parseArticleRevisionSnapshot(
  value: unknown
): ArticleRevisionSnapshot {
  if (value === null || typeof value !== "object") {
    throw new ArticleRestoreRefusedError(
      "NO_SNAPSHOT",
      "This revision has no restorable snapshot."
    );
  }
  const row = value as Record<string, unknown>;
  const body = row.bodyMarkdown;
  const digest = row.bodySha256;
  if (typeof body !== "string" || body.trim().length === 0) {
    throw new ArticleRestoreRefusedError(
      "SNAPSHOT_INVALID",
      "This revision recorded no article source."
    );
  }
  if (
    typeof digest !== "string" ||
    createHash("sha256").update(body, "utf8").digest("hex") !== digest
  ) {
    throw new ArticleRestoreRefusedError(
      "SNAPSHOT_INVALID",
      "This revision's source no longer matches the digest recorded with it."
    );
  }
  if (typeof row.title !== "string" || typeof row.slug !== "string") {
    throw new ArticleRestoreRefusedError(
      "SNAPSHOT_INVALID",
      "This revision recorded no article identity."
    );
  }
  return {
    title: row.title,
    slug: row.slug,
    excerpt: typeof row.excerpt === "string" ? row.excerpt : null,
    seoTitle: typeof row.seoTitle === "string" ? row.seoTitle : null,
    seoDescription:
      typeof row.seoDescription === "string" ? row.seoDescription : null,
    canonicalUrl:
      typeof row.canonicalUrl === "string" ? row.canonicalUrl : null,
    socialImageId:
      typeof row.socialImageId === "string" ? row.socialImageId : null,
    frontmatterSchemaVersion:
      typeof row.frontmatterSchemaVersion === "number"
        ? row.frontmatterSchemaVersion
        : 1,
    status: typeof row.status === "string" ? row.status : "DRAFT",
    bodyMarkdown: body,
    version: typeof row.version === "number" ? row.version : 0,
  };
}
