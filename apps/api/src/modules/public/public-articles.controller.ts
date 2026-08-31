import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  publicArticleTranslationNotFoundSchema,
  publicTaxonomyKindSchema,
  type PublicArticleDetailEnvelope,
  type PublicArticleListEnvelope,
  type PublicArticleTaxonomyEnvelope,
  type PublicBlogTaxonomyIndexEnvelope,
  type PublicFeedIndexEnvelope,
  type PublicTaxonomyKind,
} from "@portfolio/contracts/blog";
import {
  buildErrorBody,
  localeSchema,
  paginationQuerySchema,
  slugSchemaFor,
  toFieldErrors,
} from "@portfolio/contracts/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createPublicEtag,
  PUBLIC_LONG_CACHE_CONTROL,
  PUBLIC_SHORT_CACHE_CONTROL,
} from "./public-cache.js";
import {
  InvalidPublicArticleCursorError,
  PublicArticlesService,
} from "./public-articles.service.js";

export const PUBLIC_ARTICLES_SERVICE = Symbol("PUBLIC_ARTICLES_SERVICE");

@Controller("public")
export class PublicArticlesController {
  public constructor(
    @Inject(PUBLIC_ARTICLES_SERVICE)
    private readonly articles: PublicArticlesService
  ) {}

  @Get(":locale/blog/posts")
  async list(
    @Param("locale") localeInput: string,
    @Query() query: Readonly<Record<string, unknown>>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicArticleListEnvelope | undefined> {
    const requestId = randomUUID();
    const locale = localeSchema.safeParse(localeInput);
    const pagination = paginationQuerySchema.safeParse(query);
    if (!locale.success || !pagination.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          ...(!locale.success
            ? { locale: ["Locale must be one of the enabled public locales."] }
            : {}),
          ...(!pagination.success ? toFieldErrors(pagination.error) : {}),
        })
      );
    }

    let read;
    try {
      read = await this.articles.list(locale.data, pagination.data);
    } catch (error) {
      if (!(error instanceof InvalidPublicArticleCursorError)) throw error;
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          cursor: ["Article cursor is invalid or expired."],
        })
      );
    }
    const etag = createPublicEtag({
      data: read.data,
      nextCursor: read.nextCursor,
    });
    setJsonHeaders(reply, locale.data, etag, read.lastModified);
    if (request.headers["if-none-match"] === etag) {
      reply.status(304);
      return undefined;
    }
    return {
      data: read.data,
      meta: { requestId, nextCursor: read.nextCursor },
    };
  }

  @Get(":locale/blog/taxonomy")
  async taxonomyIndex(
    @Param("locale") localeInput: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicBlogTaxonomyIndexEnvelope | undefined> {
    const requestId = randomUUID();
    const locale = localeSchema.safeParse(localeInput);
    if (!locale.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          locale: ["Locale must be one of the enabled public locales."],
        })
      );
    }
    const read = await this.articles.taxonomyIndex(locale.data);
    const etag = createPublicEtag(read.data);
    setJsonHeaders(reply, locale.data, etag, read.lastModified);
    if (request.headers["if-none-match"] === etag) {
      reply.status(304);
      return undefined;
    }
    return { data: read.data, meta: { requestId } };
  }

  @Get(":locale/blog/feed-index")
  async feedIndex(
    @Param("locale") localeInput: string,
    @Query() query: Readonly<Record<string, unknown>>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicFeedIndexEnvelope | undefined> {
    const requestId = randomUUID();
    const locale = localeSchema.safeParse(localeInput);
    const pagination = paginationQuerySchema.safeParse(query);
    if (!locale.success || !pagination.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          ...(!locale.success
            ? { locale: ["Locale must be one of the enabled public locales."] }
            : {}),
          ...(!pagination.success ? toFieldErrors(pagination.error) : {}),
        })
      );
    }

    let read;
    try {
      read = await this.articles.feedIndex(locale.data, pagination.data);
    } catch (error) {
      if (!(error instanceof InvalidPublicArticleCursorError)) throw error;
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          cursor: ["Article cursor is invalid or expired."],
        })
      );
    }
    const etag = createPublicEtag({
      data: read.data,
      nextCursor: read.nextCursor,
    });
    setJsonHeaders(reply, locale.data, etag, read.lastModified);
    if (request.headers["if-none-match"] === etag) {
      reply.status(304);
      return undefined;
    }
    return {
      data: read.data,
      meta: { requestId, nextCursor: read.nextCursor },
    };
  }

  @Get(":locale/blog/categories/:slug")
  async category(
    @Param("locale") localeInput: string,
    @Param("slug") slugInput: string,
    @Query() query: Readonly<Record<string, unknown>>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicArticleTaxonomyEnvelope | undefined> {
    return this.taxonomy(
      "category",
      localeInput,
      slugInput,
      query,
      request,
      reply
    );
  }

  @Get(":locale/blog/tags/:slug")
  async tag(
    @Param("locale") localeInput: string,
    @Param("slug") slugInput: string,
    @Query() query: Readonly<Record<string, unknown>>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicArticleTaxonomyEnvelope | undefined> {
    return this.taxonomy("tag", localeInput, slugInput, query, request, reply);
  }

  /**
   * Category and tag pages share one body because they differ only in which
   * relation is filtered. Two copies would be two places for the published,
   * unarchived, integrity-valid predicate to drift — and the one that drifted
   * would be the one that listed an article the detail route refuses.
   */
  private async taxonomy(
    kindInput: PublicTaxonomyKind,
    localeInput: string,
    slugInput: string,
    query: Readonly<Record<string, unknown>>,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<PublicArticleTaxonomyEnvelope | undefined> {
    const requestId = randomUUID();
    const kind = publicTaxonomyKindSchema.parse(kindInput);
    const locale = localeSchema.safeParse(localeInput);
    const slug = locale.success
      ? slugSchemaFor(locale.data).safeParse(slugInput)
      : undefined;
    const pagination = paginationQuerySchema.safeParse(query);
    if (!locale.success || !slug?.success || !pagination.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          ...(!locale.success
            ? { locale: ["Locale must be one of the enabled public locales."] }
            : {}),
          ...(slug !== undefined && !slug.success
            ? { slug: ["Taxonomy slug must be canonical for its locale."] }
            : {}),
          ...(!pagination.success ? toFieldErrors(pagination.error) : {}),
        })
      );
    }

    let read;
    try {
      read = await this.articles.listByTaxonomy(
        locale.data,
        kind,
        slug.data,
        pagination.data
      );
    } catch (error) {
      if (!(error instanceof InvalidPublicArticleCursorError)) throw error;
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          cursor: ["Article cursor is invalid or expired."],
        })
      );
    }
    // A disabled or unknown term is absent, not empty: answering with an empty
    // list would leave a crawlable page behind after an editor withdrew it.
    if (read.kind === "missing") {
      throw new NotFoundException(buildErrorBody("NOT_FOUND", requestId));
    }
    const etag = createPublicEtag({
      data: read.data,
      nextCursor: read.nextCursor,
    });
    setJsonHeaders(reply, locale.data, etag, read.lastModified);
    if (request.headers["if-none-match"] === etag) {
      reply.status(304);
      return undefined;
    }
    return {
      data: read.data,
      meta: { requestId, nextCursor: read.nextCursor },
    };
  }

  @Get(":locale/blog/posts/:slug/image")
  async image(
    @Param("locale") localeInput: string,
    @Param("slug") slugInput: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<Buffer | undefined> {
    const requestId = randomUUID();
    const locale = localeSchema.safeParse(localeInput);
    const slug = locale.success
      ? slugSchemaFor(locale.data).safeParse(slugInput)
      : undefined;
    if (!locale.success || !slug?.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          ...(!locale.success
            ? { locale: ["Locale must be one of the enabled public locales."] }
            : {}),
          ...(slug !== undefined && !slug.success
            ? { slug: ["Article slug must be canonical for its locale."] }
            : {}),
        })
      );
    }
    const image = await this.articles.readImage(locale.data, slug.data);
    if (image === null) {
      throw new NotFoundException(buildErrorBody("NOT_FOUND", requestId));
    }
    const etag = `"sha256-${image.checksumSha256}"`;
    reply.header("cache-control", PUBLIC_LONG_CACHE_CONTROL);
    reply.header("content-type", image.mimeType);
    reply.header("etag", etag);
    reply.header("last-modified", image.lastModified.toUTCString());
    reply.header("x-content-type-options", "nosniff");
    reply.header("content-disposition", "inline");
    if (request.headers["if-none-match"] === etag) {
      reply.status(304);
      return undefined;
    }
    return Buffer.from(await image.readBytes());
  }

  @Get(":locale/blog/posts/:slug")
  async detail(
    @Param("locale") localeInput: string,
    @Param("slug") slugInput: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicArticleDetailEnvelope | undefined> {
    const requestId = randomUUID();
    const locale = localeSchema.safeParse(localeInput);
    const slug = locale.success
      ? slugSchemaFor(locale.data).safeParse(slugInput)
      : undefined;
    if (!locale.success || !slug?.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          ...(!locale.success
            ? { locale: ["Locale must be one of the enabled public locales."] }
            : {}),
          ...(slug !== undefined && !slug.success
            ? { slug: ["Article slug must be canonical for its locale."] }
            : {}),
        })
      );
    }

    const read = await this.articles.detail(locale.data, slug.data);
    if (read.kind === "missing") {
      throw new NotFoundException(
        publicArticleTranslationNotFoundSchema.parse({
          ...buildErrorBody("TRANSLATION_NOT_FOUND", requestId),
          meta: {
            requestId,
            availableTranslations: read.availableTranslations,
          },
        })
      );
    }
    const etag = createPublicEtag(read.data);
    setJsonHeaders(reply, locale.data, etag, read.lastModified);
    if (request.headers["if-none-match"] === etag) {
      reply.status(304);
      return undefined;
    }
    return { data: read.data, meta: { requestId } };
  }
}

function setJsonHeaders(
  reply: FastifyReply,
  locale: string,
  etag: string,
  lastModified: Date
): void {
  reply.header("cache-control", PUBLIC_SHORT_CACHE_CONTROL);
  reply.header("content-language", locale);
  reply.header("etag", etag);
  reply.header("last-modified", lastModified.toUTCString());
}
