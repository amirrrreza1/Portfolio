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
import type { PublicAppearanceEnvelope } from "@portfolio/contracts/appearance";
import { buildErrorBody, localeSchema } from "@portfolio/contracts/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { createPublicEtag, PUBLIC_LONG_CACHE_CONTROL } from "./public-cache.js";
import { PublicAppearanceService } from "./public-appearance.service.js";

export const PUBLIC_APPEARANCE_SERVICE = Symbol("PUBLIC_APPEARANCE_SERVICE");

@Controller("public")
export class PublicAppearanceController {
  public constructor(
    @Inject(PUBLIC_APPEARANCE_SERVICE)
    private readonly appearance: PublicAppearanceService
  ) {}

  @Get(":locale/appearance")
  async read(
    @Param("locale") localeInput: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicAppearanceEnvelope | undefined> {
    const requestId = randomUUID();
    const locale = localeSchema.safeParse(localeInput);
    if (!locale.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          locale: ["Locale must be one of the enabled public locales."],
        })
      );
    }

    const read = await this.appearance.read(locale.data);
    const etag = createPublicEtag(read.data);

    reply.header("cache-control", PUBLIC_LONG_CACHE_CONTROL);
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
