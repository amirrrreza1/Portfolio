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
  type PublicArticleDetailEnvelope,
  type PublicArticleListEnvelope,
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
