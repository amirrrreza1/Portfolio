import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Logger,
  type ExceptionFilter,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseFilters,
} from "@nestjs/common";
import {
  adminTaxonomySchema,
  adminTaxonomyTranslationSchemaFor,
  archiveTranslationSchema,
  autosaveDraftSchema,
  importRequestSchema,
  previewTranslationSchema,
  publishTranslationSchema,
  saveTranslationSchema,
  scheduleTranslationSchema,
  unpublishTranslationSchema,
} from "@portfolio/contracts/blog";
import {
  buildErrorBody,
  ERROR_STATUS,
  toFieldErrors,
  type ErrorCode,
  type FieldErrors,
} from "@portfolio/contracts/common";
import {
  ArticleTransitionRefusedError,
  ArticleVersionConflictError,
  TaxonomyNotFoundError,
  TaxonomyVersionConflictError,
  type TaxonomyKind,
} from "@portfolio/database";
import {
  MAX_ARTICLE_IMPORT_BYTES,
  MarkdownValidationError,
} from "@portfolio/markdown";
import { MediaValidationError } from "@portfolio/media";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { AdminRequestBoundary } from "../admin/admin-request.js";
import {
  AUTH_RUNTIME_CONFIG,
  AUTH_SERVICE,
  type AuthRuntimeConfig,
} from "../auth/auth.controller.js";
import type { AuthService } from "../auth/auth.service.js";
import { ArticleImportReportError, BlogAdminService } from "./blog.service.js";

export const BLOG_ADMIN_SERVICE = Symbol("BLOG_ADMIN_SERVICE");

/**
 * Translates the store's refusals into the shared error envelope.
 *
 * A checklist refusal carries the checklist itself in the field errors. The
 * author needs to know *which* blocker stopped them, and an opaque
 * "cannot publish" would send them back to a screen that already told them
 * everything was fine.
 */
@Catch()
class BlogExceptionFilter implements ExceptionFilter {
  private static readonly logger = new Logger(BlogExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (exception instanceof HttpException) {
      void reply.status(exception.getStatus()).send(exception.getResponse());
      return;
    }
    const requestId = randomUUID();

    if (exception instanceof ArticleVersionConflictError) {
      void reply.status(ERROR_STATUS.CONFLICT).send(
        buildErrorBody("CONFLICT", requestId, {
          expectedVersion: [String(exception.expectedVersion)],
          currentVersion: [
            exception.currentVersion === null
              ? "missing"
              : String(exception.currentVersion),
          ],
        })
      );
      return;
    }
    if (exception instanceof TaxonomyVersionConflictError) {
      void reply.status(ERROR_STATUS.CONFLICT).send(
        buildErrorBody("CONFLICT", requestId, {
          expectedVersion: [String(exception.expectedVersion)],
          currentVersion: [
            exception.currentVersion === null
              ? "missing"
              : String(exception.currentVersion),
          ],
        })
      );
      return;
    }
    if (exception instanceof TaxonomyNotFoundError) {
      void reply
        .status(ERROR_STATUS.NOT_FOUND)
        .send(buildErrorBody("NOT_FOUND", requestId));
      return;
    }
    if (exception instanceof ArticleTransitionRefusedError) {
      if (exception.code === "NOT_FOUND") {
        void reply
          .status(ERROR_STATUS.NOT_FOUND)
          .send(buildErrorBody("NOT_FOUND", requestId));
        return;
      }
      void reply.status(ERROR_STATUS.VALIDATION_FAILED).send(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          transition: [exception.detail],
          ...(exception.checklist === null
            ? {}
            : {
                blockers: [...exception.checklist.blockers],
                warnings: [...exception.checklist.warnings],
              }),
        })
      );
      return;
    }
    if (exception instanceof MarkdownValidationError) {
      void reply.status(ERROR_STATUS.VALIDATION_FAILED).send(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          body: [exception.message],
        })
      );
      return;
    }
    if (exception instanceof MediaValidationError) {
      void reply.status(ERROR_STATUS.VALIDATION_FAILED).send(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          file: [exception.message],
        })
      );
      return;
    }
    if (exception instanceof ArticleImportReportError) {
      const code: ErrorCode =
        exception.reason === "REPORT_USED"
          ? "CONFLICT"
          : exception.reason === "REPORT_REJECTED"
            ? "VALIDATION_FAILED"
            : exception.reason === "STORAGE_UNAVAILABLE"
              ? "INTERNAL_ERROR"
              : "NOT_FOUND";
      void reply.status(ERROR_STATUS[code]).send(
        buildErrorBody(code, requestId, {
          ...(code === "VALIDATION_FAILED"
            ? { reportToken: ["The dry-run report was not accepted."] }
            : {}),
        })
      );
      return;
    }
    const databaseCode =
      typeof exception === "object" && exception !== null && "code" in exception
        ? String((exception as { readonly code: unknown }).code)
        : null;
    if (databaseCode === "P2002") {
      void reply.status(ERROR_STATUS.VALIDATION_FAILED).send(
        buildErrorBody("VALIDATION_FAILED", requestId, {
          resource: ["A record with that unique value already exists."],
        })
      );
      return;
    }
    // An unmapped failure answers with an opaque body on purpose, but it must
    // not also be invisible on the server. A 500 with nothing in the log is a
    // defect nobody can diagnose without reproducing it by hand.
    BlogExceptionFilter.logger.error(
      `Unhandled blog authoring failure (requestId ${requestId})`,
      exception instanceof Error ? exception.stack : String(exception)
    );
    void reply
      .status(ERROR_STATUS.INTERNAL_ERROR)
      .send(buildErrorBody("INTERNAL_ERROR", requestId));
  }
}

/** The authenticated M8 blog authoring boundary, per API_SPEC §6. */
@Controller("admin/blog")
@UseFilters(BlogExceptionFilter)
export class BlogAdminController {
  private readonly boundary: AdminRequestBoundary;

  public constructor(
    @Inject(BLOG_ADMIN_SERVICE) private readonly blog: BlogAdminService,
    @Inject(AUTH_SERVICE) auth: AuthService,
    @Inject(AUTH_RUNTIME_CONFIG) config: AuthRuntimeConfig
  ) {
    this.boundary = new AdminRequestBoundary(auth, config);
  }

  @Get("posts")
  async listPosts(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    await this.boundary.require(request, "content.draft.read");
    this.boundary.noStore(reply);
    return this.envelope(await this.blog.listPosts());
  }

  @Get("posts/:id/translations/:locale")
  async readTranslation(
    @Param("id") id: string,
    @Param("locale") locale: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    const actor = await this.boundary.require(request, "content.draft.read");
    const value = await this.blog.readTranslation(
      this.boundary.id(id, requestId),
      this.boundary.locale(locale, requestId),
      actor.user.userId
    );
    if (value === null) {
      throw this.fail("NOT_FOUND", requestId);
    }
    this.boundary.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Get("posts/:id/translations/:locale/checklist")
  async checklist(
    @Param("id") id: string,
    @Param("locale") locale: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    await this.boundary.require(request, "content.draft.read");
    const value = await this.blog.checklist(
      this.boundary.id(id, requestId),
      this.boundary.locale(locale, requestId)
    );
    if (value === null) throw this.fail("NOT_FOUND", requestId);
    this.boundary.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Put("posts/:id/translations/:locale")
  async saveTranslation(
    @Param("id") id: string,
    @Param("locale") locale: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    const actor = await this.boundary.requireMutation(
      request,
      "content.draft.write"
    );
    const postId = this.boundary.id(id, requestId);
    const target = this.boundary.locale(locale, requestId);
    const command = this.parse(saveTranslationSchema, body, requestId);
    // The path is the addressing authority. A body that names a different
    // post or locale is not a save of the thing the caller asked for, and
    // accepting it would let one URL write anywhere.
    if (
      command.frontmatter.postId !== postId ||
      command.frontmatter.locale !== target
    ) {
      throw this.fail("VALIDATION_FAILED", requestId, {
        frontmatter: ["postId and locale must match the request path."],
      });
    }
    this.boundary.noStore(reply);
    return this.envelope(
      await this.blog.saveTranslation(command, actor.user.userId),
      requestId
    );
  }

  @Put("posts/:id/translations/:locale/draft")
  async autosave(
    @Param("id") id: string,
    @Param("locale") locale: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    const actor = await this.boundary.requireMutation(
      request,
      "content.draft.write"
    );
    this.boundary.noStore(reply);
    return this.envelope(
      await this.blog.autosave(
        this.boundary.id(id, requestId),
        this.boundary.locale(locale, requestId),
        actor.user.userId,
        this.parse(autosaveDraftSchema, body, requestId)
      ),
      requestId
    );
  }

  @Post("posts/:id/translations/:locale/preview")
  async preview(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    await this.boundary.requireMutation(request, "content.draft.write");
    const preview = await this.blog.previewTranslation(
      this.parse(previewTranslationSchema, body, requestId)
    );
    this.boundary.noStore(reply);
    return this.envelope(
      {
        previewUrl: `/admin/blog/previews/${preview.token}`,
        expiresAt: preview.expiresAt,
      },
      requestId
    );
  }

  @Post("import")
  async importArticle(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    const contentType = String(request.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      const command = this.parse(importRequestSchema, body, requestId);
      if (!command.confirm) {
        throw this.fail("VALIDATION_FAILED", requestId, {
          file: ["A dry run requires one multipart Markdown upload."],
        });
      }
      const actor = await this.boundary.requireMutation(
        request,
        "content.import"
      );
      const value = await this.blog.confirmImport(actor.user.userId, command);
      this.boundary.noStore(reply);
      return this.envelope(value, requestId);
    }

    const actor = await this.boundary.requireMutation(
      request,
      "content.draft.write"
    );
    const part = await request.file({
      limits: {
        fileSize: MAX_ARTICLE_IMPORT_BYTES,
        files: 1,
        fields: 4,
        parts: 5,
      },
    });
    if (part === undefined) {
      throw this.fail("VALIDATION_FAILED", requestId, {
        file: ["Choose one .md, .markdown, or .mdx file."],
      });
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of part.file as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > MAX_ARTICLE_IMPORT_BYTES) {
        throw this.fail("PAYLOAD_TOO_LARGE", requestId);
      }
      chunks.push(chunk);
    }
    if (part.file.truncated) {
      throw this.fail("PAYLOAD_TOO_LARGE", requestId);
    }
    const postIdValue = importMultipartField(part.fields, "postId");
    const command = this.parse(
      importRequestSchema,
      {
        postId: postIdValue.trim().length === 0 ? null : postIdValue,
        locale: importMultipartField(part.fields, "locale"),
        confirm: false,
        reportToken: null,
      },
      requestId
    );
    const value = await this.blog.prepareImport(actor.user.userId, command, {
      filename: part.filename,
      bytes: Buffer.concat(chunks),
    });
    this.boundary.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Get("previews/:token")
  async readPreview(
    @Param("token") token: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const requestId = randomUUID();
    await this.boundary.require(request, "content.draft.read");
    const html = this.blog.readPreview(token);
    if (html === null) throw this.fail("NOT_FOUND", requestId);
    this.boundary.noStore(reply);
    // A preview is unpublished work behind an authenticated boundary. If one
    // ever leaks into an index it is a disclosure, not a ranking problem.
    void reply.header("X-Robots-Tag", "noindex, nofollow, noarchive");
    return this.envelope({ html }, requestId);
  }

  @Post("posts/:id/translations/:locale/publish")
  publish(
    @Param("id") id: string,
    @Param("locale") locale: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.transition(
      id,
      locale,
      body,
      request,
      reply,
      publishTranslationSchema,
      "content.publish",
      (postId, target, actorId, command) =>
        this.blog.publish(postId, target, actorId, command)
    );
  }

  @Post("posts/:id/translations/:locale/schedule")
  schedule(
    @Param("id") id: string,
    @Param("locale") locale: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.transition(
      id,
      locale,
      body,
      request,
      reply,
      scheduleTranslationSchema,
      "content.publish",
      (postId, target, actorId, command) =>
        this.blog.schedule(postId, target, actorId, command)
    );
  }

  @Post("posts/:id/translations/:locale/unpublish")
  unpublish(
    @Param("id") id: string,
    @Param("locale") locale: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.transition(
      id,
      locale,
      body,
      request,
      reply,
      unpublishTranslationSchema,
      // Withdrawing is a publish-class action, and SECURITY.md §3 puts it
      // behind recent auth: a session left open on a laptop must not be
      // enough to take an article off the site.
      "content.delete",
      (postId, target, actorId, command) =>
        this.blog.unpublish(postId, target, actorId, command)
    );
  }

  @Post("posts/:id/translations/:locale/archive")
  archive(
    @Param("id") id: string,
    @Param("locale") locale: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.transition(
      id,
      locale,
      body,
      request,
      reply,
      archiveTranslationSchema,
      "content.delete",
      (postId, target, actorId, command) =>
        this.blog.archive(postId, target, actorId, command)
    );
  }

  @Get("categories")
  listCategories(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.listTaxonomy("category", request, reply);
  }

  @Get("tags")
  listTags(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.listTaxonomy("tag", request, reply);
  }

  @Post("categories")
  createCategory(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.createTaxonomy("category", body, request, reply);
  }

  @Post("tags")
  createTag(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.createTaxonomy("tag", body, request, reply);
  }

  @Put("categories/:id")
  updateCategory(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.updateTaxonomy("category", id, body, request, reply);
  }

  @Put("tags/:id")
  updateTag(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.updateTaxonomy("tag", id, body, request, reply);
  }

  @Put("categories/:id/translations/:locale")
  saveCategoryTranslation(
    @Param("id") id: string,
    @Param("locale") locale: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.saveTaxonomyTranslation(
      "category",
      id,
      locale,
      body,
      request,
      reply
    );
  }

  @Put("tags/:id/translations/:locale")
  saveTagTranslation(
    @Param("id") id: string,
    @Param("locale") locale: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.saveTaxonomyTranslation(
      "tag",
      id,
      locale,
      body,
      request,
      reply
    );
  }

  private async transition<T>(
    id: string,
    locale: string,
    body: unknown,
    request: FastifyRequest,
    reply: FastifyReply,
    schema: z.ZodType<T>,
    permission: "content.publish" | "content.delete",
    run: (
      postId: string,
      locale: "en" | "fa",
      actorId: string,
      command: T
    ) => Promise<unknown>
  ) {
    const requestId = randomUUID();
    const actor = await this.boundary.requireMutation(request, permission);
    const value = await run(
      this.boundary.id(id, requestId),
      this.boundary.locale(locale, requestId),
      actor.user.userId,
      this.parse(schema, body, requestId)
    );
    this.boundary.noStore(reply);
    return this.envelope(value, requestId);
  }

  private async listTaxonomy(
    kind: TaxonomyKind,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    await this.boundary.require(request, "content.draft.read");
    this.boundary.noStore(reply);
    return this.envelope(await this.blog.listTaxonomy(kind));
  }

  private async createTaxonomy(
    kind: TaxonomyKind,
    body: unknown,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const requestId = randomUUID();
    const actor = await this.boundary.requireMutation(
      request,
      "settings.manage"
    );
    const value = await this.blog.createTaxonomy(
      kind,
      actor.user.userId,
      this.parse(adminTaxonomySchema, body, requestId)
    );
    this.boundary.noStore(reply);
    void reply.status(201);
    return this.envelope(value, requestId);
  }

  private async updateTaxonomy(
    kind: TaxonomyKind,
    id: string,
    body: unknown,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const requestId = randomUUID();
    const actor = await this.boundary.requireMutation(
      request,
      "settings.manage"
    );
    const value = await this.blog.updateTaxonomy(
      kind,
      actor.user.userId,
      this.boundary.id(id, requestId),
      this.boundary.ifMatch(request, requestId),
      this.parse(adminTaxonomySchema, body, requestId)
    );
    this.boundary.noStore(reply);
    return this.envelope(value, requestId);
  }

  private async saveTaxonomyTranslation(
    kind: TaxonomyKind,
    id: string,
    locale: string,
    body: unknown,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const requestId = randomUUID();
    const actor = await this.boundary.requireMutation(
      request,
      "settings.manage"
    );
    const target = this.boundary.locale(locale, requestId);
    const value = await this.blog.saveTaxonomyTranslation(
      kind,
      actor.user.userId,
      this.boundary.id(id, requestId),
      target,
      this.boundary.ifMatch(request, requestId),
      this.parse(adminTaxonomyTranslationSchemaFor(target), body, requestId)
    );
    this.boundary.noStore(reply);
    return this.envelope(value, requestId);
  }

  private envelope(data: unknown, requestId = randomUUID()) {
    return { data, meta: { requestId } };
  }

  private parse<T>(schema: z.ZodType<T>, body: unknown, requestId: string): T {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw this.fail(
        "VALIDATION_FAILED",
        requestId,
        toFieldErrors(result.error)
      );
    }
    return result.data;
  }

  private fail(
    code: ErrorCode,
    requestId: string,
    fields: FieldErrors = {}
  ): HttpException {
    return this.boundary.fail(code, requestId, fields);
  }
}

function importMultipartField(fields: unknown, name: string): string {
  if (typeof fields !== "object" || fields === null) return "";
  const raw = (fields as Record<string, unknown>)[name];
  const item: unknown = Array.isArray(raw) ? raw[0] : raw;
  if (typeof item !== "object" || item === null) return "";
  const value = (item as { readonly value?: unknown }).value;
  return typeof value === "string" ? value : "";
}
