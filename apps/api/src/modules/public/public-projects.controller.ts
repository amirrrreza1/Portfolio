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
import type { PublicProjectsEnvelope } from "@portfolio/contracts/portfolio";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createPublicEtag,
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
}
