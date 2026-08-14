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
  certificateIdSchema,
  localeSchema,
} from "@portfolio/contracts/common";
import type { PublicHomeEnvelope } from "@portfolio/contracts/portfolio";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createPublicEtag,
  PUBLIC_LONG_CACHE_CONTROL,
  PUBLIC_SHORT_CACHE_CONTROL,
} from "./public-cache.js";
import {
  PublicHomeService,
  type PublicFileRead,
} from "./public-home.service.js";

export const PUBLIC_HOME_SERVICE = Symbol("PUBLIC_HOME_SERVICE");

@Controller("public")
export class PublicHomeController {
  public constructor(
    @Inject(PUBLIC_HOME_SERVICE)
    private readonly home: PublicHomeService
  ) {}

  @Get(":locale/home")
  async read(
    @Param("locale") localeInput: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<PublicHomeEnvelope | undefined> {
    const requestId = randomUUID();
    const locale = localeSchema.safeParse(localeInput);
    if (!locale.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          locale: ["Locale must be one of the enabled public locales."],
        })
      );
    }

    const read = await this.home.read(locale.data);
    const etag = createPublicEtag(read.data);
    setPublicHeaders(reply, locale.data, etag, read.lastModified);

    if (request.headers["if-none-match"] === etag) {
      reply.status(304);
      return undefined;
    }
    return { data: read.data, meta: { requestId } };
  }

  @Get("certificates/:certificateId/file")
  async certificateFile(
    @Param("certificateId") idInput: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<Buffer | undefined> {
    const requestId = randomUUID();
    const id = certificateIdSchema.safeParse(idInput);
    if (!id.success) {
      throw new BadRequestException(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          certificateId: ["Certificate ID must be an opaque public ID."],
        })
      );
    }
    const file = await this.home.readCertificateFile(id.data);
    return this.sendFile(file, request, reply, requestId, true);
  }

  @Get("resume/file")
  async resumeFile(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<Buffer | undefined> {
    const requestId = randomUUID();
    const file = await this.home.readResumeFile();
    return this.sendFile(file, request, reply, requestId, false);
  }

  private async sendFile(
    file: PublicFileRead | null,
    request: FastifyRequest,
    reply: FastifyReply,
    requestId: string,
    immutable: boolean
  ): Promise<Buffer | undefined> {
    if (file === null) {
      throw new NotFoundException(buildErrorBody("NOT_FOUND", requestId));
    }
    const etag = `"sha256-${file.checksumSha256}"`;
    reply.header(
      "cache-control",
      immutable ? PUBLIC_LONG_CACHE_CONTROL : PUBLIC_SHORT_CACHE_CONTROL
    );
    reply.header("content-type", file.mimeType);
    reply.header("content-disposition", attachmentDisposition(file.filename));
    reply.header("etag", etag);
    reply.header("last-modified", file.lastModified.toUTCString());
    reply.header("x-content-type-options", "nosniff");

    if (request.headers["if-none-match"] === etag) {
      reply.status(304);
      return undefined;
    }
    return Buffer.from(await file.readBytes());
  }
}

function setPublicHeaders(
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

function attachmentDisposition(filename: string): string {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
