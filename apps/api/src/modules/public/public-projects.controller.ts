import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
  Res,
} from "@nestjs/common";
import {
  buildErrorBody,
  localeSchema,
  slugSchemaFor,
} from "@portfolio/contracts/common";
import type {
  PublicProjectDetailEnvelope,
  PublicProjectsEnvelope,
} from "@portfolio/contracts/portfolio";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createPublicEtag,
  PUBLIC_LONG_CACHE_CONTROL,
  PUBLIC_SHORT_CACHE_CONTROL,
} from "./public-cache.js";
import { PublicProjectsService } from "./public-projects.service.js";

export const PUBLIC_PROJECTS_SERVICE = Symbol("PUBLIC_PROJECTS_SERVICE");

@Controller("public")
export class PublicProjectsController {
  public constructor(
    @Inject(PUBLIC_PROJECTS_SERVICE)
    private readonly projects: PublicProjectsService
  ) {}

  @Get(":locale/projects")
  async list(
    @Param("locale") localeInput: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicProjectsEnvelope | undefined> {
    const requestId = randomUUID();
    const locale = localeSchema.safeParse(localeInput);
    if (!locale.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          locale: ["Locale must be one of the enabled public locales."],
        })
      );
    }

    const read = await this.projects.read(locale.data);
    const etag = createPublicEtag(read.data);

    reply.header("cache-control", PUBLIC_SHORT_CACHE_CONTROL);
    reply.header("content-language", locale.data);
    reply.header("etag", etag);
    reply.header("last-modified", read.lastModified.toUTCString());

    if (request.headers["if-none-match"] === etag) {
      reply.status(304);
      return undefined;
    }

    return { data: read.data, meta: { requestId } };
  }

  @Get(":locale/projects/:slug")
  async detail(
    @Param("locale") localeInput: string,
    @Param("slug") slugInput: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicProjectDetailEnvelope | undefined> {
    const requestId = randomUUID();
    const locale = localeSchema.safeParse(localeInput);
    const slug = slugSchemaFor("en").safeParse(slugInput);
    if (!locale.success || !slug.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          ...(!locale.success
            ? { locale: ["Locale must be one of the enabled public locales."] }
            : {}),
          ...(!slug.success
            ? { slug: ["Project slug must be canonical lowercase ASCII."] }
            : {}),
        })
      );
    }

    const read = await this.projects.readDetail(locale.data, slug.data);
    if (read === null) {
      throw new NotFoundException(buildErrorBody("NOT_FOUND", requestId));
    }
    const etag = createPublicEtag(read.data);
    setJsonHeaders(reply, locale.data, etag, read.lastModified);
    if (request.headers["if-none-match"] === etag) {
      reply.status(304);
      return undefined;
    }
    return { data: read.data, meta: { requestId } };
  }

  @Get("projects/:slug/image")
  async image(
    @Param("slug") slugInput: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<Buffer | undefined> {
    const requestId = randomUUID();
    const slug = slugSchemaFor("en").safeParse(slugInput);
    if (!slug.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          slug: ["Project slug must be canonical lowercase ASCII."],
        })
      );
    }
    const image = await this.projects.readImage(slug.data);
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
