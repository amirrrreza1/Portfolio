/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Prisma's transaction client is structurally typed but not exported by the generated client. This adapter is contained here; controller inputs are runtime validated. */

import {
  ArticleRestoreRefusedError,
  OptimisticConcurrencyError,
  restoreArticleRevision,
  type Database,
} from "@portfolio/database";
import type {
  AdminAppearanceUpdate,
  AdminCertificate,
  AdminCertificateTranslation,
  AdminProject,
  AdminProjectTranslation,
  AdminNavItemCreate,
  AdminSectionTranslation,
  AdminSectionUpdate,
  AdminSiteSettingsTranslation,
  AdminSiteSettingsUpdate,
  AdminSkill,
  AdminSkillCategory,
  AdminSkillCategoryTranslation,
  AdminQuote,
  AdminResume,
  AdminResumeUpdate,
  AdminMediaUpdate,
  AdminMediaUploadFields,
  AdminSocialLinkCreate,
  AdminUserUpdate,
  AdminUserCreate,
} from "@portfolio/contracts/portfolio";
import { hashPassword, issueRecoveryCodes } from "@portfolio/auth-core";
import {
  adminAppearanceUpdateSchema,
  adminCertificateSchema,
  adminCertificateTranslationSchema,
  adminMediaUpdateSchema,
  adminNavItemCreateSchema,
  adminProjectSchema,
  adminProjectTranslationSchema,
  adminQuoteSchema,
  adminResumeUpdateSchema,
  adminSectionTranslationSchema,
  adminSectionUpdateSchema,
  adminSiteSettingsTranslationSchema,
  adminSiteSettingsUpdateSchema,
  adminSkillCategorySchema,
  adminSkillCategoryTranslationSchema,
  adminSkillSchema,
  adminSocialLinkCreateSchema,
} from "@portfolio/contracts/portfolio";
import {
  invalidationEventSchema,
  publicCacheTag,
} from "@portfolio/contracts/content";
import { randomUUID } from "node:crypto";

import { isRoleAssignable } from "../auth/authorization.js";
import {
  ingestMedia,
  MediaQuarantinedError,
  type MediaObjectStore,
} from "@portfolio/media";

export class AdminResourceNotFoundError extends Error {
  constructor(public readonly resource: string, public readonly id: string) {
    super(`${resource} was not found.`);
    this.name = "AdminResourceNotFoundError";
  }
}

export class AdminResourceReferencedError extends Error {
  constructor(public readonly fields: Record<string, readonly string[]>) {
    super("The resource is still referenced.");
    this.name = "AdminResourceReferencedError";
  }
}

export class AdminMediaRejectedError extends Error {
  constructor(public readonly mediaId: string | null = null) {
    super("The upload did not pass media verification.");
    this.name = "AdminMediaRejectedError";
  }
}

export class AdminInvariantError extends Error {
  constructor(public readonly fields: Record<string, readonly string[]>) {
    super("The requested change violates a content invariant.");
    this.name = "AdminInvariantError";
  }
}

export type ArchivableResource =
  | "projects"
  | "certificates"
  | "skill-categories"
  | "skills"
  | "quotes"
  | "nav-items"
  | "social-links";

/**
 * Portfolio CMS persistence for M7's site-shell slice.
 *
 * This deliberately does not expose Prisma delegates to controllers. Every
 * write records an immutable revision, an append-only audit event, and raises
 * a conflict if the `If-Match` version no longer describes the target row.
 */
export class AdminPortfolioService {
  public constructor(
    private readonly database: Database,
    private readonly mediaStore?: MediaObjectStore,
    private readonly recoverySecret?: string,
    /** Only used to evaluate off-site canonical URLs on the article path. */
    private readonly siteOrigin: string | null = null
  ) {}

  async readSettings(): Promise<unknown> {
    const settings = await this.database.siteSettings.findUniqueOrThrow({
      where: { id: 1 },
      include: { translations: { orderBy: { locale: "asc" } } },
    });
    return {
      ...settings,
      birthDate:
        settings.birthDate === null ? null : dateOnly(settings.birthDate),
      searchConsoleTokens: editableVerificationTokens(
        settings.searchConsoleTokens
      ),
    };
  }

  /** Safe ADMIN-003 summary: counts and event categories only, never bodies or credentials. */
  async dashboard(): Promise<unknown> {
    const { auditRetentionDays } =
      await this.database.siteSettings.findUniqueOrThrow({
        where: { id: 1 },
        select: { auditRetentionDays: true },
      });
    const auditCutoff = retentionCutoff(auditRetentionDays);
    const [drafts, scheduled, contacts, recentEdits, securityEvents, outbox, jobs] = await Promise.all([
      this.database.postTranslation.count({ where: { status: "DRAFT", archivedAt: null } }),
      this.database.postTranslation.count({ where: { status: "SCHEDULED", archivedAt: null } }),
      this.database.contactMessage.count({ where: { deletionDueAt: { gt: new Date() } } }),
      this.database.contentRevision.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, entityType: true, entityId: true, action: true, createdAt: true, actor: { select: { displayName: true } } } }),
      this.database.auditEvent.findMany({ where: { outcome: "FAILURE", createdAt: { gte: auditCutoff } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, eventType: true, targetType: true, outcome: true, createdAt: true } }),
      this.database.contentInvalidationOutbox.groupBy({ by: ["state"], _count: { _all: true } }),
      this.database.contentJob.groupBy({ by: ["state"], _count: { _all: true } }),
    ]);
    return {
      drafts,
      scheduled,
      contactMessages: contacts,
      recentEdits,
      securityEvents,
      delivery: {
        invalidations: Object.fromEntries(outbox.map((row) => [row.state, row._count._all])),
        publicationJobs: Object.fromEntries(jobs.map((row) => [row.state, row._count._all])),
      },
    };
  }

  async updateSettings(
    actorId: string,
    version: number,
    input: AdminSiteSettingsUpdate
  ): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.siteSettings.findUnique({ where: { id: 1 } });
      if (before === null) throw new Error("Site settings singleton is missing.");
      await assertMediaReference(tx, input.settings.defaultSocialImageId, "IMAGE");
      await requireVersion(tx.siteSettings, "SiteSettings", "1", version, {
        ...input.settings,
        birthDate:
          input.settings.birthDate === null
            ? null
            : new Date(`${input.settings.birthDate}T00:00:00.000Z`),
      });
      const after = await tx.siteSettings.findUniqueOrThrow({ where: { id: 1 } });
      await this.recordChange(tx, actorId, "SiteSettings", "1", after.version, "UPDATE", redactSettings(before), redactSettings(after));
      return after;
    });
  }

  async updateSettingsTranslation(
    actorId: string,
    locale: "en" | "fa",
    version: number,
    input: AdminSiteSettingsTranslation
  ): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.siteSettingsTranslation.findUnique({
        where: { siteSettingsId_locale: { siteSettingsId: 1, locale } },
      });
      const after = await upsertTranslation(
        tx.siteSettingsTranslation,
        "SiteSettingsTranslation",
        locale,
        version,
        { siteSettingsId_locale: { siteSettingsId: 1, locale } },
        { siteSettingsId: 1, locale, ...input },
        input
      );
      await this.recordChange(
        tx,
        actorId,
        "SiteSettingsTranslation",
        locale,
        after.version,
        before === null ? "CREATE" : "UPDATE",
        before,
        after
      );
      return after;
    });
  }

  async readAppearance(): Promise<unknown> {
    return this.database.appearanceSettings.findUniqueOrThrow({ where: { id: 1 } });
  }

  async updateAppearance(
    actorId: string,
    version: number,
    input: AdminAppearanceUpdate
  ): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.appearanceSettings.findUnique({ where: { id: 1 } });
      if (before === null) throw new Error("Appearance settings singleton is missing.");
      await requireVersion(tx.appearanceSettings, "AppearanceSettings", "1", version, {
        ...input.settings,
        defaultBlogFontByLocale: input.settings.defaultBlogFontByLocale,
      });
      const after = await tx.appearanceSettings.findUniqueOrThrow({ where: { id: 1 } });
      await this.recordChange(tx, actorId, "AppearanceSettings", "1", after.version, "UPDATE", before, after);
      return after;
    });
  }

  async listSections(): Promise<unknown> {
    return this.database.pageSection.findMany({
      where: { archivedAt: null },
      include: { translations: { orderBy: { locale: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    });
  }

  async updateSection(actorId: string, id: string, version: number, input: AdminSectionUpdate): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.pageSection.findUnique({ where: { id } });
      if (before === null) throw new OptimisticConcurrencyError("PageSection", id, version, null);
      if (before.key !== input.key) throw new Error("Section key does not match the target.");
      await requireVersion(tx.pageSection, "PageSection", id, version, {
        content: input.content,
        enabled: input.enabled,
        sortOrder: input.sortOrder,
      });
      const after = await tx.pageSection.findUniqueOrThrow({ where: { id } });
      await this.recordChange(tx, actorId, "PageSection", id, after.version, "UPDATE", before, after);
      return after;
    });
  }

  async updateSectionTranslation(actorId: string, id: string, locale: "en" | "fa", version: number, input: AdminSectionTranslation): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const section = await tx.pageSection.findUnique({ where: { id } });
      if (section === null) throw new OptimisticConcurrencyError("PageSection", id, version, null);
      if (section.key !== input.key) throw new Error("Section key does not match the target.");
      const before = await tx.pageSectionTranslation.findUnique({ where: { sectionId_locale: { sectionId: id, locale } } });
      const translation = await upsertTranslation(
        tx.pageSectionTranslation,
        "PageSectionTranslation",
        `${id}:${locale}`,
        version,
        { sectionId_locale: { sectionId: id, locale } },
        { sectionId: id, locale, ...input.translation },
        input.translation
      );
      await this.recordChange(tx, actorId, "PageSectionTranslation", `${id}:${locale}`, translation.version, before === null ? "CREATE" : "UPDATE", before, translation);
      return translation;
    });
  }

  async listNavigation(): Promise<unknown> {
    return this.database.navItem.findMany({ orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { id: "asc" }] });
  }

  async createNavigation(actorId: string, input: AdminNavItemCreate): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const item = await tx.navItem.create({ data: { ...input, labelByLocale: input.labelByLocale as never } });
      await this.recordChange(tx, actorId, "NavItem", item.id, item.version, "CREATE", null, item);
      return item;
    });
  }

  async updateNavigation(actorId: string, id: string, version: number, input: AdminNavItemCreate): Promise<unknown> {
    return this.updateVersioned(tx => tx.navItem, actorId, "NavItem", id, version, { ...input, labelByLocale: input.labelByLocale });
  }

  async listSocialLinks(): Promise<unknown> {
    return this.database.socialLink.findMany({ orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { id: "asc" }] });
  }

  async createSocialLink(actorId: string, input: AdminSocialLinkCreate): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const link = await tx.socialLink.create({ data: { ...input, labelByLocale: input.labelByLocale as never } });
      await this.recordChange(tx, actorId, "SocialLink", link.id, link.version, "CREATE", null, link);
      return link;
    });
  }

  async updateSocialLink(actorId: string, id: string, version: number, input: AdminSocialLinkCreate): Promise<unknown> {
    return this.updateVersioned(tx => tx.socialLink, actorId, "SocialLink", id, version, { ...input, labelByLocale: input.labelByLocale });
  }

  async listSkillCategories(): Promise<unknown> {
    return this.database.skillCategory.findMany({ include: { translations: { orderBy: { locale: "asc" } }, skills: { orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { name: "asc" }] } }, orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { key: "asc" }] });
  }

  async createSkillCategory(actorId: string, input: AdminSkillCategory): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const category = await tx.skillCategory.create({ data: input });
      await this.recordChange(tx, actorId, "SkillCategory", category.id, category.version, "CREATE", null, category);
      return category;
    });
  }

  async updateSkillCategory(actorId: string, id: string, version: number, input: AdminSkillCategory): Promise<unknown> {
    return this.updateVersioned((tx) => tx.skillCategory, actorId, "SkillCategory", id, version, input);
  }

  async updateSkillCategoryTranslation(actorId: string, id: string, locale: "en" | "fa", version: number, input: AdminSkillCategoryTranslation): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.skillCategoryTranslation.findUnique({ where: { categoryId_locale: { categoryId: id, locale } } });
      const translation = await upsertTranslation(tx.skillCategoryTranslation, "SkillCategoryTranslation", `${id}:${locale}`, version, { categoryId_locale: { categoryId: id, locale } }, { categoryId: id, locale, ...input }, input);
      await this.recordChange(tx, actorId, "SkillCategoryTranslation", `${id}:${locale}`, translation.version, before === null ? "CREATE" : "UPDATE", before, translation);
      return translation;
    });
  }

  async createSkill(actorId: string, input: AdminSkill): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      await assertActiveCategory(tx, input.categoryId);
      await assertMediaReference(tx, input.iconMediaId, "IMAGE");
      const skill = await tx.skill.create({ data: input });
      await this.recordChange(tx, actorId, "Skill", skill.id, skill.version, "CREATE", null, skill);
      return skill;
    });
  }

  async updateSkill(actorId: string, id: string, version: number, input: AdminSkill): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      await assertActiveCategory(tx, input.categoryId);
      await assertMediaReference(tx, input.iconMediaId, "IMAGE");
      return this.updateVersionedInTransaction(tx, tx.skill, actorId, "Skill", id, version, input);
    });
  }

  async listProjects(): Promise<unknown> {
    return this.database.project.findMany({ include: { translations: { orderBy: { locale: "asc" } }, skills: { orderBy: { sortOrder: "asc" } } }, orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { slug: "asc" }] });
  }

  async createProject(actorId: string, input: AdminProject): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      await assertMediaReference(tx, input.imageId, "IMAGE");
      await assertProjectSkills(tx, input.skills.map((skill) => skill.skillId));
      const project = await tx.project.create({ data: projectData(input) });
      await tx.projectSkill.createMany({ data: input.skills.map((skill) => ({ projectId: project.id, ...skill })) });
      const after = await tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: { skills: { orderBy: { sortOrder: "asc" } } },
      });
      await this.recordChange(tx, actorId, "Project", project.id, project.version, "CREATE", null, after);
      return after;
    });
  }

  async updateProject(actorId: string, id: string, version: number, input: AdminProject): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      await assertMediaReference(tx, input.imageId, "IMAGE");
      await assertProjectSkills(tx, input.skills.map((skill) => skill.skillId));
      const before = await tx.project.findUnique({ where: { id }, include: { skills: { orderBy: { sortOrder: "asc" } } } });
      if (before === null) throw new OptimisticConcurrencyError("Project", id, version, null);
      await requireVersion(tx.project, "Project", id, version, projectData(input));
      await tx.projectSkill.deleteMany({ where: { projectId: id } });
      await tx.projectSkill.createMany({ data: input.skills.map((skill) => ({ projectId: id, ...skill })) });
      const after = await tx.project.findUniqueOrThrow({
        where: { id },
        include: { skills: { orderBy: { sortOrder: "asc" } } },
      });
      await this.recordChange(tx, actorId, "Project", id, after.version, "UPDATE", before, after);
      return after;
    });
  }

  async updateProjectTranslation(actorId: string, id: string, locale: "en" | "fa", version: number, input: AdminProjectTranslation): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.projectTranslation.findUnique({ where: { projectId_locale: { projectId: id, locale } } });
      const translation = await upsertTranslation(tx.projectTranslation, "ProjectTranslation", `${id}:${locale}`, version, { projectId_locale: { projectId: id, locale } }, { projectId: id, locale, ...input }, input);
      await this.recordChange(tx, actorId, "ProjectTranslation", `${id}:${locale}`, translation.version, before === null ? "CREATE" : "UPDATE", before, translation);
      return translation;
    });
  }

  async listCertificates(): Promise<unknown> {
    return this.database.certificate.findMany({ include: { translations: { orderBy: { locale: "asc" } } }, orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { issuedAt: "desc" }] });
  }

  async createCertificate(actorId: string, input: AdminCertificate): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      await assertMediaReference(tx, input.mediaId, "DOCUMENT", "application/pdf");
      const certificate = await tx.certificate.create({ data: certificateData(input) });
      await this.recordChange(tx, actorId, "Certificate", certificate.id, certificate.version, "CREATE", null, certificate);
      return certificate;
    });
  }

  async updateCertificate(actorId: string, id: string, version: number, input: AdminCertificate): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      await assertMediaReference(tx, input.mediaId, "DOCUMENT", "application/pdf");
      return this.updateVersionedInTransaction(tx, tx.certificate, actorId, "Certificate", id, version, certificateData(input));
    });
  }

  async updateCertificateTranslation(actorId: string, id: string, locale: "en" | "fa", version: number, input: AdminCertificateTranslation): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.certificateTranslation.findUnique({ where: { certificateId_locale: { certificateId: id, locale } } });
      const translation = await upsertTranslation(tx.certificateTranslation, "CertificateTranslation", `${id}:${locale}`, version, { certificateId_locale: { certificateId: id, locale } }, { certificateId: id, locale, ...input }, input);
      await this.recordChange(tx, actorId, "CertificateTranslation", `${id}:${locale}`, translation.version, before === null ? "CREATE" : "UPDATE", before, translation);
      return translation;
    });
  }

  async listQuotes(): Promise<unknown> { return this.database.quote.findMany({ orderBy: [{ archivedAt: "asc" }, { pinned: "desc" }, { sortOrder: "asc" }, { id: "asc" }] }); }
  async createQuote(actorId: string, input: AdminQuote): Promise<unknown> {
    return this.database.$transaction(async (tx) => { const quote = await tx.quote.create({ data: { ...input, textByLocale: input.textByLocale as never } }); await this.recordChange(tx, actorId, "Quote", quote.id, quote.version, "CREATE", null, quote); return quote; });
  }
  async updateQuote(actorId: string, id: string, version: number, input: AdminQuote): Promise<unknown> {
    return this.updateVersioned((tx) => tx.quote, actorId, "Quote", id, version, { ...input, textByLocale: input.textByLocale });
  }

  async listMedia(): Promise<unknown> {
    const media = await this.database.mediaAsset.findMany({
      select: {
        id: true,
        displayName: true,
        kind: true,
        mimeType: true,
        byteSize: true,
        checksumSha256: true,
        width: true,
        height: true,
        altText: true,
        processingState: true,
        visibility: true,
        archivedAt: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: { select: { displayName: true } },
        _count: {
          select: {
            projects: true,
            certificates: true,
            skills: true,
            posts: true,
            postTranslations: true,
            resumeVersions: true,
            siteSettings: true,
          },
        },
      },
      orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    return media.map(safeMedia);
  }

  async uploadMedia(
    actorId: string,
    input: AdminMediaUploadFields & {
      readonly filename: string;
      readonly bytes: Uint8Array;
    }
  ): Promise<unknown> {
    if (this.mediaStore === undefined) {
      throw new AdminInvariantError({ media: ["Media storage is unavailable."] });
    }

    let verified;
    try {
      verified = await ingestMedia(
        {
          bytes: input.bytes,
          filename: input.filename,
          kind: input.kind,
          visibility: input.visibility,
          maxBytes: input.kind === "IMAGE" ? 8 * 1024 * 1024 : 10 * 1024 * 1024,
          maxWidth: 6_000,
          maxHeight: 6_000,
          maxPdfPages: 100,
        },
        this.mediaStore
      );
    } catch (error) {
      if (!(error instanceof MediaQuarantinedError)) throw error;
      const media = error.media;
      await this.database.$transaction(async (tx) => {
        await tx.mediaAsset.create({
          data: {
            id: media.id,
            storageKey: media.storageKey,
            displayName: media.displayName,
            kind: media.kind,
            mimeType: media.mimeType,
            byteSize: media.byteSize,
            checksumSha256: media.checksumSha256,
            width: null,
            height: null,
            altText: input.altText,
            processingState: "QUARANTINED",
            visibility: "PRIVATE",
            uploadedById: actorId,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            eventType: "admin.media.rejected",
            targetType: "MediaAsset",
            targetId: media.id,
            outcome: "FAILURE",
            metadata: { reason: "verification_failed" },
          },
        });
      });
      throw new AdminMediaRejectedError(media.id);
    }

    try {
      return await this.database.$transaction(async (tx) => {
        const media = await tx.mediaAsset.create({
          data: {
            ...verified,
            altText: input.altText,
            uploadedById: actorId,
          },
        });
        await this.recordChange(
          tx,
          actorId,
          "MediaAsset",
          media.id,
          media.version,
          "CREATE",
          null,
          media
        );
        return safeMedia(media);
      });
    } catch (error) {
      await this.mediaStore.remove(verified.storageKey).catch(() => undefined);
      throw error;
    }
  }

  async updateMedia(
    actorId: string,
    id: string,
    version: number,
    input: AdminMediaUpdate
  ): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.mediaAsset.findUnique({ where: { id } });
      if (current === null) throw new AdminResourceNotFoundError("MediaAsset", id);
      if (current.kind === "IMAGE" && input.altText === null) {
        throw new AdminInvariantError({ altText: ["Images require alternative text."] });
      }
      return this.updateVersionedInTransaction(
        tx,
        tx.mediaAsset,
        actorId,
        "MediaAsset",
        id,
        version,
        input
      );
    });
  }

  async archiveMedia(actorId: string, id: string, version: number): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const media = await tx.mediaAsset.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              projects: true,
              certificates: true,
              skills: true,
              posts: true,
              postTranslations: true,
              resumeVersions: true,
              siteSettings: true,
            },
          },
        },
      });
      if (media === null) throw new AdminResourceNotFoundError("MediaAsset", id);
      const references = Object.values(media._count).reduce(
        (total, count) => total + Number(count),
        0
      );
      if (references > 0) {
        throw new AdminResourceReferencedError({
          media: [`Detach this asset from its ${references} reference(s) first.`],
        });
      }
      return this.archiveInTransaction(tx, tx.mediaAsset, actorId, "MediaAsset", id, version, true);
    });
  }

  async restoreMedia(actorId: string, id: string, version: number): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const media = await tx.mediaAsset.findUnique({ where: { id } });
      if (media === null) throw new AdminResourceNotFoundError("MediaAsset", id);
      if (media.processingState !== "VERIFIED") {
        throw new AdminInvariantError({
          media: ["Only a verified asset can be restored."],
        });
      }
      return this.archiveInTransaction(tx, tx.mediaAsset, actorId, "MediaAsset", id, version, false);
    });
  }

  async listResumes(): Promise<unknown> {
    return this.database.resumeVersion.findMany({ include: { mediaAsset: { select: { id: true, displayName: true, mimeType: true, processingState: true } }, uploadedBy: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  }
  async createResume(actorId: string, input: AdminResume): Promise<unknown> {
    return this.database.$transaction(async (tx) => { await assertMediaReference(tx, input.mediaAssetId, "DOCUMENT", "application/pdf"); const resume = await tx.resumeVersion.create({ data: { ...input, uploadedById: actorId } }); await this.recordChange(tx, actorId, "ResumeVersion", resume.id, resume.version, "CREATE", null, resume); return resume; });
  }

  async updateResume(actorId: string, id: string, version: number, input: AdminResumeUpdate): Promise<unknown> {
    return this.updateVersioned((tx) => tx.resumeVersion, actorId, "ResumeVersion", id, version, input);
  }

  async activateResume(actorId: string, id: string, version: number): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const target = await tx.resumeVersion.findUnique({ where: { id }, include: { mediaAsset: true } });
      if (target === null) throw new AdminResourceNotFoundError("ResumeVersion", id);
      if (target.mediaAsset.archivedAt !== null || target.mediaAsset.processingState !== "VERIFIED" || target.mediaAsset.mimeType !== "application/pdf") {
        throw new AdminInvariantError({ resume: ["The selected PDF is not available for activation."] });
      }
      if (target.version !== version) throw new OptimisticConcurrencyError("ResumeVersion", id, version, target.version);
      const now = new Date();
      const current = await tx.resumeVersion.findFirst({ where: { activatedAt: { not: null }, retiredAt: null, id: { not: id } } });
      if (current !== null) {
        await requireVersion(tx.resumeVersion, "ResumeVersion", current.id, current.version, { retiredAt: now });
        const retired = await tx.resumeVersion.findUniqueOrThrow({ where: { id: current.id } });
        await this.recordChange(tx, actorId, "ResumeVersion", current.id, retired.version, "UPDATE", current, retired);
      }
      await requireVersion(tx.resumeVersion, "ResumeVersion", id, version, { activatedAt: now, retiredAt: null });
      const active = await tx.resumeVersion.findUniqueOrThrow({ where: { id } });
      await this.recordChange(tx, actorId, "ResumeVersion", id, active.version, "UPDATE", target, active);
      return active;
    });
  }

  async archiveResource(actorId: string, resource: ArchivableResource, id: string, version: number): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      if (resource === "skill-categories") {
        const references = await tx.skill.count({ where: { categoryId: id, archivedAt: null } });
        if (references > 0) throw new AdminResourceReferencedError({ category: ["Archive or move its skills first."] });
      }
      if (resource === "skills") {
        const references = await tx.projectSkill.count({ where: { skillId: id } });
        if (references > 0) throw new AdminResourceReferencedError({ skill: ["Detach this skill from projects first."] });
      }
      const target = resourceDelegate(tx, resource);
      return this.archiveInTransaction(tx, target.delegate, actorId, target.entityType, id, version, true);
    });
  }

  async restoreResource(actorId: string, resource: ArchivableResource, id: string, version: number): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const target = resourceDelegate(tx, resource);
      return this.archiveInTransaction(tx, target.delegate, actorId, target.entityType, id, version, false);
    });
  }

  async listRevisions(entityType?: string, entityId?: string): Promise<unknown> {
    return this.database.contentRevision.findMany({
      where: {
        ...(entityType === undefined ? {} : { entityType }),
        ...(entityId === undefined ? {} : { entityId }),
      },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        entityVersion: true,
        action: true,
        before: true,
        after: true,
        createdAt: true,
        actor: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  /**
   * The single restore endpoint, per API_SPEC §6.
   *
   * An article translation is answered before the generic transaction opens,
   * not inside the switch below. Its restore has to render Markdown and
   * re-derive a digest, and doing that between `BEGIN` and `COMMIT` would hold
   * a write transaction open across the whole pipeline; opening a second
   * transaction from inside this one would be worse still. So the article path
   * runs its own read-render-write, using the same versioned save an author's
   * edit uses, and this method's job is only to route to it.
   */
  async restoreRevision(actorId: string, revisionId: string): Promise<unknown> {
    const head = await this.database.contentRevision.findUnique({
      where: { id: revisionId },
      select: { entityType: true },
    });
    if (head?.entityType === "PostTranslation") {
      try {
        return await restoreArticleRevision(this.database, {
          revisionId,
          actorId,
          siteOrigin: this.siteOrigin,
        });
      } catch (error) {
        if (!(error instanceof ArticleRestoreRefusedError)) throw error;
        if (error.code === "TRANSLATION_MISSING") {
          throw new AdminResourceNotFoundError("PostTranslation", revisionId);
        }
        throw new AdminInvariantError({ revision: [error.detail] });
      }
    }
    return this.database.$transaction(async (tx) => {
      const revision = await tx.contentRevision.findUnique({
        where: { id: revisionId },
      });
      if (revision === null) {
        throw new AdminResourceNotFoundError("ContentRevision", revisionId);
      }
      const snapshot = asRecord(revision.after);
      if (snapshot === null) {
        throw new AdminInvariantError({ revision: ["This revision has no restorable snapshot."] });
      }

      switch (revision.entityType) {
        case "SiteSettings": {
          const current = await tx.siteSettings.findUnique({ where: { id: 1 } });
          if (current === null) throw new AdminResourceNotFoundError("SiteSettings", "1");
          const parsed = parseRestore(adminSiteSettingsUpdateSchema, {
            settings: {
              canonicalSiteUrl: snapshot.canonicalSiteUrl,
              defaultLocale: snapshot.defaultLocale,
              enabledLocales: snapshot.enabledLocales,
              timezone: snapshot.timezone,
              defaultSocialImageId: snapshot.defaultSocialImageId ?? null,
              authorName: snapshot.authorName,
              creatorName: snapshot.creatorName,
              publisherName: snapshot.publisherName,
              contactRecipientEmail: current.contactRecipientEmail,
              contactEnabled: snapshot.contactEnabled,
              contactRetentionDays: snapshot.contactRetentionDays,
              auditRetentionDays: snapshot.auditRetentionDays,
              searchConsoleTokens: editableVerificationTokens(
                current.searchConsoleTokens
              ),
              githubUsername: snapshot.githubUsername ?? null,
              githubRepoAllowlist: snapshot.githubRepoAllowlist,
              githubCacheTtlSeconds: snapshot.githubCacheTtlSeconds,
              robotsAllowIndexing: snapshot.robotsAllowIndexing,
              birthDate: current.birthDate === null ? null : dateOnly(current.birthDate),
            },
          });
          await assertMediaReference(tx, parsed.settings.defaultSocialImageId, "IMAGE");
          return this.updateVersionedInTransaction(
            tx,
            tx.siteSettings,
            actorId,
            "SiteSettings",
            "1",
            current.version,
            {
              ...parsed.settings,
              birthDate:
                parsed.settings.birthDate === null
                  ? null
                  : new Date(`${parsed.settings.birthDate}T00:00:00.000Z`),
            },
            "RESTORE"
          );
        }
        case "AppearanceSettings": {
          const parsed = parseRestore(adminAppearanceUpdateSchema, {
            settings: pick(snapshot, [
              "enabledThemes",
              "defaultTheme",
              "enabledBlogFonts",
              "defaultBlogFontByLocale",
              "allowedBlogSizeSteps",
              "defaultBlogSizeStep",
              "offerMotionToggle",
            ]),
          });
          return restoreCurrent(this, tx, tx.appearanceSettings, actorId, "AppearanceSettings", 1, parsed.settings);
        }
        case "PageSection": {
          const parsed = parseRestore(adminSectionUpdateSchema, pick(snapshot, ["key", "content", "enabled", "sortOrder"]));
          return restoreCurrent(this, tx, tx.pageSection, actorId, "PageSection", revision.entityId, {
            content: parsed.content,
            enabled: parsed.enabled,
            sortOrder: parsed.sortOrder,
          });
        }
        case "NavItem": {
          const parsed = parseRestore(adminNavItemCreateSchema, pick(snapshot, ["labelByLocale", "targetKind", "target", "iconKey", "enabled", "sortOrder"]));
          return restoreCurrent(this, tx, tx.navItem, actorId, "NavItem", revision.entityId, parsed);
        }
        case "SocialLink": {
          const parsed = parseRestore(adminSocialLinkCreateSchema, pick(snapshot, ["labelByLocale", "url", "iconKey", "rel", "kind", "enabled", "sortOrder"]));
          return restoreCurrent(this, tx, tx.socialLink, actorId, "SocialLink", revision.entityId, parsed);
        }
        case "SkillCategory": {
          const parsed = parseRestore(adminSkillCategorySchema, pick(snapshot, ["key", "enabled", "sortOrder"]));
          return restoreCurrent(this, tx, tx.skillCategory, actorId, "SkillCategory", revision.entityId, parsed);
        }
        case "Skill": {
          const parsed = parseRestore(adminSkillSchema, pick(snapshot, ["categoryId", "name", "color", "iconMediaId", "enabled", "sortOrder"]));
          await assertActiveCategory(tx, parsed.categoryId);
          await assertMediaReference(tx, parsed.iconMediaId, "IMAGE");
          return restoreCurrent(this, tx, tx.skill, actorId, "Skill", revision.entityId, parsed);
        }
        case "Project": {
          const skills = Array.isArray(snapshot.skills)
            ? snapshot.skills.map((item) => pick(asRecord(item) ?? {}, ["skillId", "sortOrder"]))
            : [];
          const parsed = parseRestore(adminProjectSchema, {
            ...pick(snapshot, ["slug", "status", "demoUrl", "repositoryUrl", "imageId", "featured", "enabled", "sortOrder"]),
            startedAt: dateOnlyOrNull(snapshot.startedAt),
            completedAt: dateOnlyOrNull(snapshot.completedAt),
            skills,
          });
          await assertMediaReference(tx, parsed.imageId, "IMAGE");
          await assertProjectSkills(tx, parsed.skills.map((skill) => skill.skillId));
          const current = await tx.project.findUnique({ where: { id: revision.entityId }, include: { skills: { orderBy: { sortOrder: "asc" } } } });
          if (current === null) throw new AdminResourceNotFoundError("Project", revision.entityId);
          await requireVersion(tx.project, "Project", revision.entityId, current.version, projectData(parsed));
          await tx.projectSkill.deleteMany({ where: { projectId: revision.entityId } });
          await tx.projectSkill.createMany({ data: parsed.skills.map((skill) => ({ projectId: revision.entityId, ...skill })) });
          const after = await tx.project.findUniqueOrThrow({ where: { id: revision.entityId }, include: { skills: { orderBy: { sortOrder: "asc" } } } });
          await this.recordChange(tx, actorId, "Project", revision.entityId, after.version, "RESTORE", current, after);
          return after;
        }
        case "Certificate": {
          const parsed = parseRestore(adminCertificateSchema, {
            ...pick(snapshot, ["issuerName", "issuerUrl", "instructorName", "instructorUrl", "scoreText", "credentialUrl", "mediaId", "enabled", "sortOrder"]),
            issuedAt: dateOnlyValue(snapshot.issuedAt),
          });
          await assertMediaReference(tx, parsed.mediaId, "DOCUMENT", "application/pdf");
          return restoreCurrent(this, tx, tx.certificate, actorId, "Certificate", revision.entityId, certificateData(parsed));
        }
        case "Quote": {
          const parsed = parseRestore(adminQuoteSchema, pick(snapshot, ["textByLocale", "author", "sourceUrl", "enabled", "pinned", "sortOrder"]));
          return restoreCurrent(this, tx, tx.quote, actorId, "Quote", revision.entityId, parsed);
        }
        case "MediaAsset": {
          const parsed = parseRestore(adminMediaUpdateSchema, pick(snapshot, ["displayName", "altText", "visibility"]));
          return restoreCurrent(this, tx, tx.mediaAsset, actorId, "MediaAsset", revision.entityId, parsed);
        }
        case "ResumeVersion": {
          const parsed = parseRestore(adminResumeUpdateSchema, pick(snapshot, ["label", "publicFilename"]));
          return restoreCurrent(this, tx, tx.resumeVersion, actorId, "ResumeVersion", revision.entityId, parsed);
        }
        case "SiteSettingsTranslation":
          return restoreTranslation(this, tx, tx.siteSettingsTranslation, actorId, revision, adminSiteSettingsTranslationSchema, pick(snapshot, ["siteName", "titleTemplate", "metaDescription", "keywords", "footerLines", "footerRights", "resumeButtonLabel"]));
        case "ProjectTranslation":
          return restoreTranslation(this, tx, tx.projectTranslation, actorId, revision, adminProjectTranslationSchema, pick(snapshot, ["title", "summary", "longDescription"]));
        case "SkillCategoryTranslation":
          return restoreTranslation(this, tx, tx.skillCategoryTranslation, actorId, revision, adminSkillCategoryTranslationSchema, pick(snapshot, ["name"]));
        case "CertificateTranslation":
          return restoreTranslation(this, tx, tx.certificateTranslation, actorId, revision, adminCertificateTranslationSchema, pick(snapshot, ["title", "description"]));
        case "PageSectionTranslation": {
          const sectionId = String(snapshot.sectionId ?? "");
          const section = await tx.pageSection.findUnique({ where: { id: sectionId } });
          if (section === null) throw new AdminResourceNotFoundError("PageSection", sectionId);
          const parsed = parseRestore(adminSectionTranslationSchema, {
            key: section.key,
            translation: pick(snapshot, ["title", "content"]),
          });
          return restoreTranslation(this, tx, tx.pageSectionTranslation, actorId, revision, { parse: () => parsed.translation }, parsed.translation);
        }
        default:
          throw new AdminInvariantError({ revision: ["This resource family cannot be restored here."] });
      }
    });
  }

  async listAuditEvents(): Promise<unknown> {
    const { auditRetentionDays } =
      await this.database.siteSettings.findUniqueOrThrow({
        where: { id: 1 },
        select: { auditRetentionDays: true },
      });
    return this.database.auditEvent.findMany({
      where: { createdAt: { gte: retentionCutoff(auditRetentionDays) } },
      select: {
        id: true,
        eventType: true,
        targetType: true,
        targetId: true,
        outcome: true,
        metadata: true,
        createdAt: true,
        actor: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async listUsers(): Promise<unknown> {
    return this.database.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        version: true,
      },
      orderBy: [{ role: "asc" }, { email: "asc" }],
    });
  }

  async createUser(actorId: string, input: AdminUserCreate): Promise<unknown> {
    if (this.recoverySecret === undefined) {
      throw new AdminInvariantError({ user: ["User provisioning is unavailable."] });
    }
    assertRoleAssignable(input.role);
    const recoveryCodes = issueRecoveryCodes(this.recoverySecret, 10);
    const passwordHash = await hashPassword(input.password);
    const user = await this.database.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          passwordHash,
          passwordChangedAt: new Date(),
        },
      });
      await tx.recoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: created.id,
          codeHash: code.hash,
        })),
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          eventType: "admin.user.create",
          targetType: "User",
          targetId: created.id,
          outcome: "SUCCESS",
          metadata: { role: created.role },
        },
      });
      return created;
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        version: user.version,
      },
      recoveryCodes: recoveryCodes.map((code) => code.displayCode),
    };
  }

  async updateUser(actorId: string, id: string, version: number, input: AdminUserUpdate): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (before === null) throw new AdminResourceNotFoundError("User", id);
      if (input.role !== before.role) assertRoleAssignable(input.role);
      const removesActiveOwner = before.role === "OWNER" && before.status === "ACTIVE" && (input.role !== "OWNER" || input.status !== "ACTIVE");
      if (removesActiveOwner) {
        const activeOwners = await tx.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
        if (activeOwners <= 1) throw new AdminInvariantError({ user: ["At least one active owner must remain."] });
      }
      await requireVersion(tx.user, "User", id, version, input);
      if (before.role !== input.role || before.status !== input.status) {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      const after = await tx.user.findUniqueOrThrow({ where: { id } });
      await tx.auditEvent.create({ data: { actorId, eventType: "admin.user.update", targetType: "User", targetId: id, outcome: "SUCCESS", metadata: { version: after.version } } });
      return { id: after.id, email: after.email, displayName: after.displayName, role: after.role, status: after.status, lastLoginAt: after.lastLoginAt, createdAt: after.createdAt, version: after.version };
    });
  }

  private async archiveInTransaction(
    tx: any,
    delegate: any,
    actorId: string,
    entityType: string,
    id: string,
    version: number,
    archive: boolean
  ): Promise<unknown> {
    const before = await delegate.findUnique({ where: { id } });
    if (before === null) throw new AdminResourceNotFoundError(entityType, id);
    await requireVersion(delegate, entityType, id, version, {
      archivedAt: archive ? new Date() : null,
    });
    const after = await delegate.findUniqueOrThrow({ where: { id } });
    await this.recordChange(
      tx,
      actorId,
      entityType,
      id,
      after.version,
      archive ? "ARCHIVE" : "RESTORE",
      before,
      after
    );
    return entityType === "MediaAsset" ? safeMedia(after) : after;
  }

  /** Internal transaction primitive shared with validated revision restore. */
  async updateVersionedInTransaction(
    tx: any,
    delegate: any,
    actorId: string,
    entityType: string,
    id: string,
    version: number,
    data: Record<string, unknown>,
    action: "UPDATE" | "RESTORE" = "UPDATE"
  ): Promise<unknown> {
    const before = await delegate.findUnique({ where: { id } });
    if (before === null) throw new AdminResourceNotFoundError(entityType, id);
    await requireVersion(delegate, entityType, id, version, data);
    const after = await delegate.findUniqueOrThrow({ where: { id } });
    await this.recordChange(
      tx,
      actorId,
      entityType,
      id,
      after.version,
      action,
      before,
      after
    );
    return entityType === "MediaAsset" ? safeMedia(after) : after;
  }

  private async updateVersioned(
    delegateFor: (tx: any) => any,
    actorId: string,
    entityType: string,
    id: string,
    version: number,
    data: Record<string, unknown>
  ): Promise<unknown> {
    return this.database.$transaction(async (tx) => {
      const delegate = delegateFor(tx);
      return this.updateVersionedInTransaction(
        tx,
        delegate,
        actorId,
        entityType,
        id,
        version,
        data
      );
    });
  }

  /** Internal append-only evidence primitive shared with revision restore. */
  async recordChange(
    tx: any,
    actorId: string,
    entityType: string,
    entityId: string,
    entityVersion: number,
    action: "CREATE" | "UPDATE" | "ARCHIVE" | "RESTORE" | "DELETE",
    before: unknown,
    after: unknown
  ) {
    await Promise.all([
      tx.contentRevision.create({ data: { entityType, entityId, entityVersion, action, actorId, before: toJson(before), after: toJson(after) } }),
      tx.auditEvent.create({ data: { actorId, eventType: `admin.${entityType.toLowerCase()}.${action.toLowerCase()}`, targetType: entityType, targetId: entityId, outcome: "SUCCESS", metadata: { version: entityVersion } } }),
      ...invalidationRows(tx, entityType),
    ]);
  }
}

/**
 * The single place a role is handed out.
 *
 * `isRoleAssignable` was written in M6 to hold `EDITOR` back until the owner's
 * v1 editor-permission ADR lands, but nothing called it — so M7's user
 * endpoints could grant the role anyway and answer an open decision by
 * shipping it. The grant table itself stays as M6 wrote it; only assignment is
 * refused.
 */
function assertRoleAssignable(role: "OWNER" | "EDITOR"): void {
  if (!isRoleAssignable(role)) {
    throw new AdminInvariantError({
      role: [
        "This role cannot be assigned until the v1 editor-permission decision is recorded.",
      ],
    });
  }
}

function retentionCutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
}

function invalidationRows(tx: any, entityType: string): Promise<unknown>[] {
  const namespaces = entityType === "AppearanceSettings"
    ? ["appearance"]
    : entityType.startsWith("Project") || entityType.startsWith("Skill")
      ? ["projects", "home"]
      : ["site", "home"];
  return (["en", "fa"] as const).map((locale) => {
    const tags = namespaces.map((namespace) => publicCacheTag(namespace, locale));
    const event = invalidationEventSchema.parse({
      eventId: randomUUID(),
      locale,
      reason: "save",
      tags,
      issuedAt: new Date().toISOString(),
    });
    return tx.contentInvalidationOutbox.create({
      data: { cacheTag: tags[0], payload: event },
    });
  });
}

async function requireVersion(delegate: any, entity: string, id: string, expected: number, data: Record<string, unknown>) {
  const result = await delegate.updateMany({ where: { id: id === "1" ? 1 : id, version: expected }, data: { ...data, version: { increment: 1 } } });
  if (result.count === 1) return;
  const current = await delegate.findUnique({ where: { id: id === "1" ? 1 : id }, select: { version: true } });
  throw new OptimisticConcurrencyError(entity, id, expected, current?.version ?? null);
}

function toJson(value: unknown): unknown {
  return value === null
    ? null
    : (JSON.parse(
        JSON.stringify(value, (_key, item: unknown) =>
          typeof item === "bigint" ? item.toString() : item
        )
      ) as unknown);
}

function redactSettings(value: Record<string, unknown>) {
  const safe = { ...value };
  delete safe.contactRecipientEmail;
  delete safe.searchConsoleTokens;
  delete safe.birthDate;
  return safe;
}

function editableVerificationTokens(value: unknown): {
  readonly google: string | null;
  readonly bing: string | null;
} {
  const record = asRecord(value);
  return {
    google: typeof record?.google === "string" ? record.google : null,
    bing: typeof record?.bing === "string" ? record.bing : null,
  };
}

function projectData(input: AdminProject) {
  return {
    slug: input.slug, status: input.status, demoUrl: input.demoUrl,
    repositoryUrl: input.repositoryUrl, imageId: input.imageId,
    featured: input.featured, enabled: input.enabled, sortOrder: input.sortOrder,
    startedAt: input.startedAt === null ? null : new Date(`${input.startedAt}T00:00:00.000Z`),
    completedAt: input.completedAt === null ? null : new Date(`${input.completedAt}T00:00:00.000Z`),
  };
}

function certificateData(input: AdminCertificate) {
  return { ...input, issuedAt: new Date(`${input.issuedAt}T00:00:00.000Z`) };
}

async function upsertTranslation(
  delegate: any,
  entityType: string,
  entityId: string,
  expectedVersion: number,
  where: Record<string, unknown>,
  create: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<any> {
  const current = await delegate.findUnique({ where });
  if (current === null) {
    if (expectedVersion !== 0) {
      throw new OptimisticConcurrencyError(
        entityType,
        entityId,
        expectedVersion,
        null
      );
    }
    try {
      return await delegate.create({ data: create });
    } catch {
      const raced = await delegate.findUnique({ where, select: { version: true } });
      if (raced !== null) {
        throw new OptimisticConcurrencyError(
          entityType,
          entityId,
          expectedVersion,
          raced.version
        );
      }
      throw new AdminInvariantError({ translation: ["The translation could not be created."] });
    }
  }
  const result = await delegate.updateMany({
    where: { id: current.id, version: expectedVersion },
    data: { ...update, version: { increment: 1 } },
  });
  if (result.count !== 1) {
    const latest = await delegate.findUnique({ where, select: { version: true } });
    throw new OptimisticConcurrencyError(
      entityType,
      entityId,
      expectedVersion,
      latest?.version ?? null
    );
  }
  return delegate.findUniqueOrThrow({ where });
}

function resourceDelegate(
  tx: any,
  resource: ArchivableResource
): { readonly delegate: any; readonly entityType: string } {
  switch (resource) {
    case "projects":
      return { delegate: tx.project, entityType: "Project" };
    case "certificates":
      return { delegate: tx.certificate, entityType: "Certificate" };
    case "skill-categories":
      return { delegate: tx.skillCategory, entityType: "SkillCategory" };
    case "skills":
      return { delegate: tx.skill, entityType: "Skill" };
    case "quotes":
      return { delegate: tx.quote, entityType: "Quote" };
    case "nav-items":
      return { delegate: tx.navItem, entityType: "NavItem" };
    case "social-links":
      return { delegate: tx.socialLink, entityType: "SocialLink" };
  }
}

async function assertMediaReference(
  tx: any,
  id: string | null,
  kind: "IMAGE" | "DOCUMENT",
  mimeType?: string
): Promise<void> {
  if (id === null) return;
  const media = await tx.mediaAsset.findUnique({ where: { id } });
  if (
    media === null ||
    media.archivedAt !== null ||
    media.processingState !== "VERIFIED" ||
    media.kind !== kind ||
    (mimeType !== undefined && media.mimeType !== mimeType)
  ) {
    throw new AdminInvariantError({
      media: ["Select an available verified asset of the required type."],
    });
  }
}

async function assertActiveCategory(tx: any, id: string): Promise<void> {
  const category = await tx.skillCategory.findUnique({ where: { id } });
  if (category === null || category.archivedAt !== null) {
    throw new AdminInvariantError({ categoryId: ["Select an active category."] });
  }
}

async function assertProjectSkills(tx: any, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const count = await tx.skill.count({
    where: { id: { in: [...ids] }, archivedAt: null },
  });
  if (count !== ids.length) {
    throw new AdminInvariantError({ skills: ["Every selected skill must be active."] });
  }
}

function safeMedia(media: any): Record<string, unknown> {
  return {
    id: media.id,
    displayName: media.displayName,
    kind: media.kind,
    mimeType: media.mimeType,
    byteSize:
      typeof media.byteSize === "bigint"
        ? media.byteSize.toString()
        : String(media.byteSize),
    checksumSha256: media.checksumSha256,
    width: media.width,
    height: media.height,
    altText: media.altText,
    processingState: media.processingState,
    visibility: media.visibility,
    archivedAt: media.archivedAt,
    version: media.version,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    uploadedBy: media.uploadedBy,
    references: media._count,
  };
}

function asRecord(value: unknown): Record<string, any> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function pick(
  value: Record<string, any>,
  keys: readonly string[]
): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function parseRestore<T>(
  schema: { readonly safeParse: (value: unknown) => { readonly success: boolean; readonly data?: T } },
  value: unknown
): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    throw new AdminInvariantError({
      revision: ["The historical snapshot no longer passes the current content contract."],
    });
  }
  return result.data;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateOnlyValue(value: unknown): string {
  const result = dateOnlyOrNull(value);
  if (result === null) {
    throw new AdminInvariantError({ revision: ["The historical date is invalid."] });
  }
  return result;
}

function dateOnlyOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    !(value instanceof Date)
  ) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : dateOnly(date);
}

async function restoreCurrent(
  service: AdminPortfolioService,
  tx: any,
  delegate: any,
  actorId: string,
  entityType: string,
  entityId: string | number,
  data: Record<string, unknown>
): Promise<unknown> {
  const databaseId =
    (entityType === "SiteSettings" || entityType === "AppearanceSettings") &&
    String(entityId) === "1"
      ? 1
      : entityId;
  const before = await delegate.findUnique({ where: { id: databaseId } });
  if (before === null) {
    throw new AdminResourceNotFoundError(entityType, String(entityId));
  }
  const result = await delegate.updateMany({
    where: { id: databaseId, version: before.version },
    data: { ...data, version: { increment: 1 } },
  });
  if (result.count !== 1) {
    const latest = await delegate.findUnique({
      where: { id: databaseId },
      select: { version: true },
    });
    throw new OptimisticConcurrencyError(
      entityType,
      String(entityId),
      before.version,
      latest?.version ?? null
    );
  }
  const after = await delegate.findUniqueOrThrow({ where: { id: databaseId } });
  await service.recordChange(
    tx,
    actorId,
    entityType,
    String(entityId),
    after.version,
    "RESTORE",
    before,
    after
  );
  return entityType === "MediaAsset" ? safeMedia(after) : after;
}

async function restoreTranslation(
  service: AdminPortfolioService,
  tx: any,
  delegate: any,
  actorId: string,
  revision: any,
  schema: { readonly safeParse?: (value: unknown) => { readonly success: boolean; readonly data?: unknown }; readonly parse?: (value: unknown) => unknown },
  data: Record<string, unknown>
): Promise<unknown> {
  const parsed = schema.safeParse === undefined
    ? schema.parse?.(data)
    : parseRestore(schema as never, data);
  if (parsed === undefined) {
    throw new AdminInvariantError({ revision: ["The translation snapshot is invalid."] });
  }
  const snapshot = asRecord(revision.after);
  const rowId = String(snapshot?.id ?? "");
  if (rowId.length === 0) {
    throw new AdminInvariantError({ revision: ["The translation snapshot has no identity."] });
  }
  const before = await delegate.findUnique({ where: { id: rowId } });
  if (before === null) {
    throw new AdminResourceNotFoundError(revision.entityType, revision.entityId);
  }
  await requireVersion(
    delegate,
    revision.entityType,
    revision.entityId,
    before.version,
    parsed as Record<string, unknown>
  );
  const after = await delegate.findUniqueOrThrow({ where: { id: rowId } });
  await service.recordChange(
    tx,
    actorId,
    revision.entityType,
    revision.entityId,
    after.version,
    "RESTORE",
    before,
    after
  );
  return after;
}
