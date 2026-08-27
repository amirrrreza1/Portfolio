import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { authorizeCookieMutation } from "@portfolio/auth-core";
import {
  CSRF_HEADER_NAME,
} from "@portfolio/contracts/auth";
import {
  adminAppearanceUpdateSchema,
  adminCertificateSchema,
  adminCertificateTranslationSchema,
  adminProjectSchema,
  adminProjectTranslationSchema,
  adminNavItemCreateSchema,
  adminSectionTranslationSchema,
  adminSectionUpdateSchema,
  adminSiteSettingsTranslationSchema,
  adminSiteSettingsUpdateSchema,
  adminSkillCategorySchema,
  adminSkillCategoryTranslationSchema,
  adminSkillSchema,
  adminQuoteSchema,
  adminResumeSchema,
  adminSocialLinkCreateSchema,
} from "@portfolio/contracts/portfolio";
import {
  buildErrorBody,
  ERROR_STATUS,
  resourceIdSchema,
  toFieldErrors,
  type ErrorCode,
  type FieldErrors,
} from "@portfolio/contracts/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  AUTH_RUNTIME_CONFIG,
  AUTH_SERVICE,
  type AuthRuntimeConfig,
} from "../auth/auth.controller.js";
import { authorize, type Permission } from "../auth/authorization.js";
import type { AuthenticatedRequest, AuthService } from "../auth/auth.service.js";
import { AdminPortfolioService } from "./admin.service.js";

export const ADMIN_PORTFOLIO_SERVICE = Symbol("ADMIN_PORTFOLIO_SERVICE");

/** The authenticated M7 portfolio CMS boundary. */
@Controller("admin")
export class AdminPortfolioController {
  public constructor(
    @Inject(ADMIN_PORTFOLIO_SERVICE)
    private readonly portfolio: AdminPortfolioService,
    @Inject(AUTH_SERVICE) private readonly auth: AuthService,
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig
  ) {}

  @Get("dashboard")
  async dashboard(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.require(request, "audit.read");
    this.noStore(reply);
    return this.envelope(await this.portfolio.dashboard());
  }

  @Get("settings")
  async settings(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.require(request, "content.draft.read");
    this.noStore(reply);
    return this.envelope(await this.portfolio.readSettings());
  }

  @Patch("settings")
  async updateSettings(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write");
    const requestId = randomUUID();
    const input = this.parse(adminSiteSettingsUpdateSchema, body, requestId);
    const value = await this.portfolio.updateSettings(actor.user.userId, this.ifMatch(request, requestId), input);
    this.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Patch("settings/translations/:locale")
  async updateSettingsTranslation(@Param("locale") locale: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write");
    const requestId = randomUUID();
    const parsedLocale = this.locale(locale, requestId);
    const input = this.parse(adminSiteSettingsTranslationSchema, body, requestId);
    const value = await this.portfolio.updateSettingsTranslation(actor.user.userId, parsedLocale, this.ifMatch(request, requestId), input);
    this.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Get("appearance")
  async appearance(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.require(request, "content.draft.read");
    this.noStore(reply);
    return this.envelope(await this.portfolio.readAppearance());
  }

  @Patch("appearance")
  async updateAppearance(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "appearance.write");
    const requestId = randomUUID();
    const input = this.parse(adminAppearanceUpdateSchema, body, requestId);
    const value = await this.portfolio.updateAppearance(actor.user.userId, this.ifMatch(request, requestId), input);
    this.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Get("sections")
  async sections(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.require(request, "content.draft.read");
    this.noStore(reply);
    return this.envelope(await this.portfolio.listSections());
  }

  @Patch("sections/:id")
  async updateSection(@Param("id") id: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write");
    const requestId = randomUUID();
    const input = this.parse(adminSectionUpdateSchema, body, requestId);
    const value = await this.portfolio.updateSection(actor.user.userId, this.id(id, requestId), this.ifMatch(request, requestId), input);
    this.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Patch("sections/:id/translations/:locale")
  async updateSectionTranslation(@Param("id") id: string, @Param("locale") locale: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write");
    const requestId = randomUUID();
    const input = this.parse(adminSectionTranslationSchema, body, requestId);
    const value = await this.portfolio.updateSectionTranslation(actor.user.userId, this.id(id, requestId), this.locale(locale, requestId), this.ifMatch(request, requestId), input);
    this.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Get("nav-items")
  async navigation(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.require(request, "content.draft.read");
    this.noStore(reply);
    return this.envelope(await this.portfolio.listNavigation());
  }

  @Post("nav-items")
  async createNavigation(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write");
    const requestId = randomUUID();
    const value = await this.portfolio.createNavigation(actor.user.userId, this.parse(adminNavItemCreateSchema, body, requestId));
    this.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Patch("nav-items/:id")
  async updateNavigation(@Param("id") id: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write");
    const requestId = randomUUID();
    const value = await this.portfolio.updateNavigation(actor.user.userId, this.id(id, requestId), this.ifMatch(request, requestId), this.parse(adminNavItemCreateSchema, body, requestId));
    this.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Get("social-links")
  async socialLinks(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.require(request, "content.draft.read");
    this.noStore(reply);
    return this.envelope(await this.portfolio.listSocialLinks());
  }

  @Post("social-links")
  async createSocialLink(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write");
    const requestId = randomUUID();
    const value = await this.portfolio.createSocialLink(actor.user.userId, this.parse(adminSocialLinkCreateSchema, body, requestId));
    this.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Patch("social-links/:id")
  async updateSocialLink(@Param("id") id: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write");
    const requestId = randomUUID();
    const value = await this.portfolio.updateSocialLink(actor.user.userId, this.id(id, requestId), this.ifMatch(request, requestId), this.parse(adminSocialLinkCreateSchema, body, requestId));
    this.noStore(reply);
    return this.envelope(value, requestId);
  }

  @Get("skill-categories")
  async skillCategories(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.require(request, "content.draft.read"); this.noStore(reply); return this.envelope(await this.portfolio.listSkillCategories());
  }

  @Post("skill-categories")
  async createSkillCategory(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.createSkillCategory(actor.user.userId, this.parse(adminSkillCategorySchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }

  @Patch("skill-categories/:id")
  async updateSkillCategory(@Param("id") id: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.updateSkillCategory(actor.user.userId, this.id(id, requestId), this.ifMatch(request, requestId), this.parse(adminSkillCategorySchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }

  @Patch("skill-categories/:id/translations/:locale")
  async updateSkillCategoryTranslation(@Param("id") id: string, @Param("locale") locale: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.updateSkillCategoryTranslation(actor.user.userId, this.id(id, requestId), this.locale(locale, requestId), this.ifMatch(request, requestId), this.parse(adminSkillCategoryTranslationSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }

  @Post("skills")
  async createSkill(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.createSkill(actor.user.userId, this.parse(adminSkillSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }

  @Patch("skills/:id")
  async updateSkill(@Param("id") id: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.updateSkill(actor.user.userId, this.id(id, requestId), this.ifMatch(request, requestId), this.parse(adminSkillSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }

  @Get("projects")
  async projects(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.require(request, "content.draft.read"); this.noStore(reply); return this.envelope(await this.portfolio.listProjects());
  }

  @Post("projects")
  async createProject(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.createProject(actor.user.userId, this.parse(adminProjectSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }

  @Patch("projects/:id")
  async updateProject(@Param("id") id: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.updateProject(actor.user.userId, this.id(id, requestId), this.ifMatch(request, requestId), this.parse(adminProjectSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }

  @Patch("projects/:id/translations/:locale")
  async updateProjectTranslation(@Param("id") id: string, @Param("locale") locale: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.updateProjectTranslation(actor.user.userId, this.id(id, requestId), this.locale(locale, requestId), this.ifMatch(request, requestId), this.parse(adminProjectTranslationSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }

  @Get("certificates")
  async certificates(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.require(request, "content.draft.read"); this.noStore(reply); return this.envelope(await this.portfolio.listCertificates());
  }
  @Post("certificates")
  async createCertificate(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.createCertificate(actor.user.userId, this.parse(adminCertificateSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }
  @Patch("certificates/:id")
  async updateCertificate(@Param("id") id: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.updateCertificate(actor.user.userId, this.id(id, requestId), this.ifMatch(request, requestId), this.parse(adminCertificateSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }
  @Patch("certificates/:id/translations/:locale")
  async updateCertificateTranslation(@Param("id") id: string, @Param("locale") locale: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID();
    const value = await this.portfolio.updateCertificateTranslation(actor.user.userId, this.id(id, requestId), this.locale(locale, requestId), this.ifMatch(request, requestId), this.parse(adminCertificateTranslationSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId);
  }
  @Get("quotes")
  async quotes(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) { await this.require(request, "content.draft.read"); this.noStore(reply); return this.envelope(await this.portfolio.listQuotes()); }
  @Post("quotes")
  async createQuote(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) { const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID(); const value = await this.portfolio.createQuote(actor.user.userId, this.parse(adminQuoteSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId); }
  @Patch("quotes/:id")
  async updateQuote(@Param("id") id: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) { const actor = await this.requireMutation(request, "content.draft.write"); const requestId = randomUUID(); const value = await this.portfolio.updateQuote(actor.user.userId, this.id(id, requestId), this.ifMatch(request, requestId), this.parse(adminQuoteSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId); }

  @Get("media")
  async media(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) { await this.require(request, "media.manage"); this.noStore(reply); return this.envelope(await this.portfolio.listMedia()); }
  @Get("resumes")
  async resumes(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) { await this.require(request, "media.manage"); this.noStore(reply); return this.envelope(await this.portfolio.listResumes()); }
  @Post("resumes")
  async createResume(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) { const actor = await this.requireMutation(request, "media.manage"); const requestId = randomUUID(); const value = await this.portfolio.createResume(actor.user.userId, this.parse(adminResumeSchema, body, requestId)); this.noStore(reply); return this.envelope(value, requestId); }
  @Post("resumes/:id/activate")
  async activateResume(@Param("id") id: string, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) { const actor = await this.requireMutation(request, "media.manage"); const requestId = randomUUID(); const value = await this.portfolio.activateResume(actor.user.userId, this.id(id, requestId)); this.noStore(reply); return this.envelope(value, requestId); }

  private envelope(data: unknown, requestId = randomUUID()) {
    return { data, meta: { requestId } };
  }

  private parse<T>(schema: z.ZodType<T>, body: unknown, requestId: string): T {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw this.fail("VALIDATION_FAILED", requestId, toFieldErrors(result.error));
    }
    return result.data;
  }

  private id(value: string, requestId: string): string {
    const result = resourceIdSchema.safeParse(value);
    if (!result.success) throw this.fail("VALIDATION_FAILED", requestId, { id: ["Invalid resource identifier."] });
    return result.data;
  }

  private locale(value: string, requestId: string): "en" | "fa" {
    if (value !== "en" && value !== "fa") throw this.fail("VALIDATION_FAILED", requestId, { locale: ["Locale must be en or fa."] });
    return value;
  }

  private ifMatch(request: FastifyRequest, requestId: string): number {
    const value = request.headers["if-match"];
    const raw = typeof value === "string" ? value.replaceAll('"', "").trim() : "";
    if (!/^\d+$/.test(raw)) throw this.fail("VALIDATION_FAILED", requestId, { "if-match": ["A non-negative record version is required."] });
    const version = Number(raw);
    if (!Number.isSafeInteger(version)) throw this.fail("VALIDATION_FAILED", requestId, { "if-match": ["A valid record version is required."] });
    return version;
  }

  private async require(request: FastifyRequest, permission: Permission): Promise<AuthenticatedRequest> {
    const authenticated = await this.auth.authenticate(this.sessionCookie(request));
    if (authenticated === null) throw this.fail("AUTHENTICATION_REQUIRED", randomUUID());
    this.allowed(authenticated, permission);
    return authenticated;
  }

  private async requireMutation(request: FastifyRequest, permission: Permission): Promise<AuthenticatedRequest> {
    const authenticated = await this.require(request, permission);
    const token = request.headers[CSRF_HEADER_NAME];
    if (!authorizeCookieMutation({ origin: request.headers.origin, expectedOrigin: this.config.origin, secFetchSite: header(request, "sec-fetch-site"), csrfToken: typeof token === "string" ? token : undefined, csrfSecret: this.config.csrfSecret, csrfBindingHash: authenticated.session.csrfBindingHash, session: authenticated.session })) {
      throw this.fail("CSRF_FAILED", randomUUID());
    }
    return authenticated;
  }

  private allowed(authenticated: AuthenticatedRequest, permission: Permission): void {
    const decision = authorize(authenticated, permission);
    if (!decision.allowed) throw this.fail("FORBIDDEN", randomUUID(), decision.reason === "recent-auth-required" ? { reauthentication: ["required"] } : {});
  }

  private sessionCookie(request: FastifyRequest): string | undefined {
    const raw = request.headers.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === "__Host-portfolio_session" || name === "portfolio_session") return decodeURIComponent(rest.join("="));
    }
    return undefined;
  }

  private noStore(reply: FastifyReply): void {
    void reply.header("Cache-Control", "private, no-store");
    void reply.header("Vary", "Cookie");
  }

  private fail(code: ErrorCode, requestId: string, fields: FieldErrors = {}): HttpException {
    return new HttpException(buildErrorBody(code, requestId, fields), ERROR_STATUS[code]);
  }
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}
