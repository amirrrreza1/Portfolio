import {
  ArticleTransitionRefusedError,
  ArticleVersionConflictError,
  createArticleStore,
  createBlogTaxonomyStore,
  type Database,
  type TaxonomyKind,
} from "@portfolio/database";
import {
  createArticleImportDiff,
  MAX_ARTICLE_IMPORT_BYTES,
  prepareArticleImport,
  renderArticleBody,
  serializeArticle,
} from "@portfolio/markdown";
import {
  quarantineArticleSource,
  type MediaObjectStore,
} from "@portfolio/media";
import {
  frontmatterSchema,
  importReportSchema,
  importRequestSchema,
  previewTranslationSchema,
  type AdminTaxonomy,
  type AdminTaxonomyTranslation,
  type ArchiveTranslation,
  type AutosaveDraft,
  type Frontmatter,
  type ImportReport,
  type ImportRequest,
  type Locale,
  type PreviewTranslation,
  type PublishTranslation,
  type SaveTranslation,
  type ScheduleTranslation,
  type UnpublishTranslation,
} from "@portfolio/contracts";
import { createHash, randomUUID } from "node:crypto";

export class ArticleImportReportError extends Error {
  public constructor(
    public readonly reason:
      | "STORAGE_UNAVAILABLE"
      | "REPORT_NOT_FOUND"
      | "REPORT_EXPIRED"
      | "REPORT_REJECTED"
      | "REPORT_USED"
  ) {
    super(
      reason === "STORAGE_UNAVAILABLE"
        ? "Article import storage is unavailable."
        : "The article import report cannot be confirmed."
    );
    this.name = "ArticleImportReportError";
  }
}

/**
 * The M8 authoring surface over M3's article authority.
 *
 * The article and taxonomy stores own content transactions. This service owns
 * the deliberately ephemeral preview cache and M8's durable two-step import
 * reports, which bind a reviewed normalization to one actor and one expiring
 * confirmation token.
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
    private readonly previewTtlMs = 10 * 60 * 1000,
    private readonly mediaStore?: MediaObjectStore,
    private readonly importTtlMs = 15 * 60 * 1000
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
   * Dry-runs one uploaded source and persists the review state.
   *
   * The exact bytes are written first to the private quarantine prefix. The
   * database row and its report are then created together; if that transaction
   * fails, the object is removed so storage cannot accumulate orphaned uploads.
   */
  async prepareImport(
    actorId: string,
    command: ImportRequest,
    upload: { readonly filename: string; readonly bytes: Uint8Array },
    now: Date = new Date()
  ): Promise<ImportReport> {
    const input = importRequestSchema.parse(command);
    if (input.confirm) throw new ArticleImportReportError("REPORT_REJECTED");
    if (this.mediaStore === undefined) {
      throw new ArticleImportReportError("STORAGE_UNAVAILABLE");
    }

    const source = await quarantineArticleSource(
      {
        ...upload,
        maxBytes: MAX_ARTICLE_IMPORT_BYTES,
      },
      this.mediaStore
    );
    try {
      let prepared = await prepareArticleImport({
        ...upload,
        expectedPostId: input.postId,
        locale: input.locale,
        inferredPostId: randomUUID(),
      });
      const targetPostId = prepared.article?.frontmatter.postId ?? null;
      const current =
        targetPostId === null
          ? null
          : await this.importTarget(targetPostId, input.locale);
      if (prepared.article !== null) {
        const realized = current?.article.frontmatter;
        const status = realized?.status ?? "draft";
        const publishedAt = realized?.publishedAt ?? null;
        const scheduledFor = realized?.scheduledFor ?? null;
        if (
          prepared.article.frontmatter.status !== status ||
          prepared.article.frontmatter.publishedAt !== publishedAt ||
          prepared.article.frontmatter.scheduledFor !== scheduledFor
        ) {
          const article = {
            ...prepared.article,
            frontmatter: frontmatterSchema.parse({
              ...prepared.article.frontmatter,
              status,
              publishedAt,
              scheduledFor,
            }),
          };
          prepared = {
            ...prepared,
            findings: [
              ...prepared.findings,
              {
                severity: "warning" as const,
                line: null,
                code: "LIFECYCLE_STATE_PRESERVED",
                message:
                  current === null
                    ? "A new import is saved as a draft; publish or schedule it with the reviewed lifecycle command."
                    : "Import cannot change publication state; the translation's current lifecycle state was preserved.",
              },
            ],
            article,
            normalizedDocument: serializeArticle(article),
          };
        }
      }
      const currentDocument =
        current === null ? null : serializeArticle(current.article);
      const diff =
        prepared.normalizedDocument === null
          ? ""
          : createArticleImportDiff(
              currentDocument,
              prepared.normalizedDocument
            );
      const token = randomUUID();
      const expiresAt = new Date(now.getTime() + this.importTtlMs);

      await this.database.$transaction(async (tx) => {
        await tx.mediaAsset.create({
          data: {
            id: source.id,
            storageKey: source.storageKey,
            displayName: source.displayName,
            kind: source.kind,
            mimeType: source.mimeType,
            byteSize: source.byteSize,
            checksumSha256: source.checksumSha256,
            width: null,
            height: null,
            altText: null,
            processingState: source.processingState,
            visibility: source.visibility,
            uploadedById: actorId,
          },
        });
        await tx.articleImportReport.create({
          data: {
            tokenHash: hashToken(token),
            actorId,
            originalMediaId: source.id,
            requestedPostId: input.postId,
            postId: targetPostId,
            locale: input.locale,
            baseVersion: current?.version ?? null,
            accepted: prepared.accepted,
            findings: prepared.findings as never,
            ...(prepared.article === null
              ? {}
              : {
                  normalizedFrontmatter: prepared.article.frontmatter as never,
                }),
            normalizedBody: prepared.article?.body ?? null,
            diff,
            expiresAt,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            eventType: "article.import.source_quarantined",
            targetType: "MediaAsset",
            targetId: source.id,
            outcome: "SUCCESS",
            metadata: {
              accepted: prepared.accepted,
              locale: input.locale,
              findingCount: prepared.findings.length,
            },
          },
        });
      });

      return importReportSchema.parse({
        reportToken: token,
        accepted: prepared.accepted,
        findings: prepared.findings,
        normalizedFrontmatter: prepared.article?.frontmatter ?? null,
        normalizedDocument: prepared.normalizedDocument,
        diff,
        quarantinedSourceId: source.id,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      await this.mediaStore.remove(source.storageKey).catch(() => undefined);
      throw error;
    }
  }

  /** Confirms exactly one actor-bound, unexpired dry-run report. */
  async confirmImport(
    actorId: string,
    command: ImportRequest,
    now: Date = new Date()
  ): Promise<unknown> {
    const input = importRequestSchema.parse(command);
    if (!input.confirm || input.reportToken === null) {
      throw new ArticleImportReportError("REPORT_REJECTED");
    }
    const report = await this.database.articleImportReport.findUnique({
      where: { tokenHash: hashToken(input.reportToken) },
    });
    if (report === null || report.actorId !== actorId) {
      throw new ArticleImportReportError("REPORT_NOT_FOUND");
    }
    if (
      report.locale !== input.locale ||
      report.requestedPostId !== input.postId
    ) {
      throw new ArticleImportReportError("REPORT_NOT_FOUND");
    }
    if (report.expiresAt <= now) {
      throw new ArticleImportReportError("REPORT_EXPIRED");
    }
    if (report.committedAt !== null) {
      throw new ArticleImportReportError("REPORT_USED");
    }
    if (
      !report.accepted ||
      report.normalizedFrontmatter === null ||
      report.normalizedBody === null
    ) {
      throw new ArticleImportReportError("REPORT_REJECTED");
    }

    const frontmatter = frontmatterSchema.parse(report.normalizedFrontmatter);
    const saved = await this.articles.saveTranslation(
      {
        frontmatter,
        body: report.normalizedBody,
        baseVersion: report.baseVersion,
      },
      actorId
    );
    const consumed = await this.database.articleImportReport.updateMany({
      where: { id: report.id, committedAt: null, expiresAt: { gt: now } },
      data: { committedAt: now },
    });
    if (consumed.count !== 1) {
      throw new ArticleImportReportError("REPORT_USED");
    }
    return { ...saved, quarantinedSourceId: report.originalMediaId };
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

  private async importTarget(
    postId: string,
    locale: Locale
  ): Promise<{
    readonly version: number;
    readonly article: {
      readonly frontmatter: Frontmatter;
      readonly body: string;
    };
  } | null> {
    const current = await this.database.postTranslation.findUnique({
      where: { postId_locale: { postId, locale } },
      include: {
        post: {
          select: {
            category: { select: { key: true } },
            tags: { select: { tag: { select: { key: true } } } },
            coverMedia: { select: { id: true, altText: true } },
          },
        },
      },
    });
    if (current === null || current.bodyMarkdown === null) return null;
    const frontmatter = frontmatterSchema.parse({
      schemaVersion: current.frontmatterSchemaVersion ?? 1,
      postId: current.postId,
      locale: current.locale,
      title: current.title,
      slug: current.slug,
      excerpt: current.excerpt,
      status: current.status.toLowerCase(),
      publishedAt: current.publishedAt?.toISOString() ?? null,
      scheduledFor: current.scheduledFor?.toISOString() ?? null,
      updatedAt: current.updatedAt.toISOString(),
      category: current.post.category?.key ?? null,
      tags: current.post.tags.map((row) => row.tag.key),
      coverImage: current.post.coverMedia?.id ?? null,
      coverImageAlt: current.post.coverMedia?.altText ?? null,
      seoTitle: current.seoTitle,
      seoDescription: current.seoDescription,
      canonicalUrl: current.canonicalUrl,
      socialImage: current.socialImageId,
      translationOf: null,
    });
    return {
      version: current.version,
      article: { frontmatter, body: current.bodyMarkdown },
    };
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

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
