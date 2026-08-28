import {
  ArticleTransitionRefusedError,
  ArticleVersionConflictError,
  createArticleStore,
  createBlogTaxonomyStore,
  type Database,
  type TaxonomyKind,
} from "@portfolio/database";
import { renderArticleBody } from "@portfolio/markdown";
import {
  frontmatterSchema,
  previewTranslationSchema,
  type AdminTaxonomy,
  type AdminTaxonomyTranslation,
  type ArchiveTranslation,
  type AutosaveDraft,
  type Locale,
  type PreviewTranslation,
  type PublishTranslation,
  type SaveTranslation,
  type ScheduleTranslation,
  type UnpublishTranslation,
} from "@portfolio/contracts";
import { randomUUID } from "node:crypto";

/**
 * The M8 authoring surface over M3's article authority.
 *
 * This service owns no persistence logic of its own — the article store and
 * the taxonomy store do, because that is where the transactions are. What it
 * owns is the preview cache, which is deliberately in-process and short-lived
 * (see `previewTranslation`).
 */
export class BlogAdminService {
  private readonly articles: ReturnType<typeof createArticleStore>;
  private readonly taxonomy: ReturnType<typeof createBlogTaxonomyStore>;
  private readonly previews = new Map<
    string,
    { readonly html: string; readonly expiresAt: number }
  >();

  public constructor(
    private readonly database: Database,
    siteOrigin: string | null = null,
    private readonly previewTtlMs = 10 * 60 * 1000
  ) {
    this.articles = createArticleStore(database, siteOrigin);
    this.taxonomy = createBlogTaxonomyStore(database);
  }

  async listPosts(): Promise<unknown> {
    const posts = await this.database.post.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        featured: true,
        archivedAt: true,
        updatedAt: true,
        version: true,
        category: { select: { key: true } },
        tags: { select: { tag: { select: { key: true } } } },
        translations: {
          orderBy: { locale: "asc" },
          select: {
            locale: true,
            title: true,
            slug: true,
            status: true,
            publishedAt: true,
            scheduledFor: true,
            version: true,
            updatedAt: true,
          },
        },
      },
    });
    return posts.map((post) => ({
      ...post,
      category: post.category?.key ?? null,
      tags: post.tags.map((row) => row.tag.key),
    }));
  }

  readTranslation(
    postId: string,
    locale: Locale,
    actorId: string
  ): Promise<unknown> {
    return this.articles.readTranslation(postId, locale, actorId);
  }

  checklist(postId: string, locale: Locale) {
    return this.articles.checklistFor(postId, locale);
  }

  saveTranslation(command: SaveTranslation, actorId: string) {
    return this.articles.saveTranslation(command, actorId);
  }

  autosave(
    postId: string,
    locale: Locale,
    actorId: string,
    command: AutosaveDraft
  ) {
    return this.articles.autosaveDraft(postId, locale, actorId, command);
  }

  publish(
    postId: string,
    locale: Locale,
    actorId: string,
    command: PublishTranslation
  ) {
    return this.articles.publishTranslation(postId, locale, actorId, command);
  }

  schedule(
    postId: string,
    locale: Locale,
    actorId: string,
    command: ScheduleTranslation
  ) {
    return this.articles.scheduleTranslation(postId, locale, actorId, command);
  }

  unpublish(
    postId: string,
    locale: Locale,
    actorId: string,
    command: UnpublishTranslation
  ) {
    return this.articles.unpublishTranslation(postId, locale, actorId, command);
  }

  archive(
    postId: string,
    locale: Locale,
    actorId: string,
    command: ArchiveTranslation
  ) {
    return this.articles.archiveTranslation(postId, locale, actorId, command);
  }

  /**
   * Renders unsaved content through the production pipeline.
   *
   * Two things make this a preview rather than a second renderer. It calls
   * `renderArticleBody` — the same function a save calls, so what is shown is
   * what publishing would produce. And it writes nothing: the render is held
   * in memory under an unguessable token and expires, so a preview can never
   * become a publication by being left open.
   *
   * The cache is per-process and is not replicated. A preview that misses
   * after a deploy is a reload; a preview that outlived its author's session
   * because it was persisted would be a disclosure.
   */
  async previewTranslation(
    command: PreviewTranslation,
    now: Date = new Date()
  ): Promise<{ readonly token: string; readonly expiresAt: string }> {
    const input = previewTranslationSchema.parse(command);
    frontmatterSchema.parse(input.frontmatter);
    const rendered = await renderArticleBody(input.body);
    const token = randomUUID();
    const expiresAt = now.getTime() + this.previewTtlMs;
    this.evictExpiredPreviews(now.getTime());
    this.previews.set(token, { html: rendered.html, expiresAt });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  readPreview(token: string, now: Date = new Date()): string | null {
    const entry = this.previews.get(token);
    if (entry === undefined) return null;
    if (entry.expiresAt <= now.getTime()) {
      this.previews.delete(token);
      return null;
    }
    return entry.html;
  }

  private evictExpiredPreviews(nowMs: number): void {
    for (const [token, entry] of this.previews) {
      if (entry.expiresAt <= nowMs) this.previews.delete(token);
    }
  }

  listTaxonomy(kind: TaxonomyKind): Promise<unknown> {
    return this.taxonomy.list(kind);
  }

  createTaxonomy(
    kind: TaxonomyKind,
    actorId: string,
    input: AdminTaxonomy
  ): Promise<unknown> {
    return this.taxonomy.create(kind, actorId, input);
  }

  updateTaxonomy(
    kind: TaxonomyKind,
    actorId: string,
    id: string,
    version: number,
    input: AdminTaxonomy
  ): Promise<unknown> {
    return this.taxonomy.update(kind, actorId, id, version, input);
  }

  saveTaxonomyTranslation(
    kind: TaxonomyKind,
    actorId: string,
    id: string,
    locale: Locale,
    version: number,
    input: AdminTaxonomyTranslation
  ): Promise<unknown> {
    return this.taxonomy.saveTranslation(
      kind,
      actorId,
      id,
      locale,
      version,
      input
    );
  }
}

export { ArticleTransitionRefusedError, ArticleVersionConflictError };
