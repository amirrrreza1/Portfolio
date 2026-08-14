import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Req,
  Res,
} from "@nestjs/common";
import { buildErrorBody, localeSchema } from "@portfolio/contracts/common";
import type { PublicSiteEnvelope } from "@portfolio/contracts/portfolio";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createPublicEtag,
  PUBLIC_SHORT_CACHE_CONTROL,
} from "./public-cache.js";
import { PublicSiteService } from "./public-site.service.js";

export const PUBLIC_SITE_SERVICE = Symbol("PUBLIC_SITE_SERVICE");

@Controller("public")
export class PublicSiteController {
  public constructor(
    @Inject(PUBLIC_SITE_SERVICE)
    private readonly site: PublicSiteService
  ) {}

  @Get(":locale/site")
  async read(
    @Param("locale") localeInput: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicSiteEnvelope | undefined> {
    const requestId = randomUUID();
    const locale = localeSchema.safeParse(localeInput);
    if (!locale.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          locale: ["Locale must be one of the enabled public locales."],
        })
      );
    }

    const read = await this.site.read(locale.data);
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
}
