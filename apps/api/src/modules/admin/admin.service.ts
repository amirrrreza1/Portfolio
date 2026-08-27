/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Prisma's transaction client is structurally typed but not exported by the generated client. This adapter is contained here; controller inputs are runtime validated. */

import {
  OptimisticConcurrencyError,
  type Database,
} from "@portfolio/database";
import type {
  AdminAppearanceUpdate,
  AdminNavItemCreate,
  AdminSectionTranslation,
  AdminSectionUpdate,
  AdminSiteSettingsTranslation,
  AdminSiteSettingsUpdate,
  AdminSocialLinkCreate,
} from "@portfolio/contracts/portfolio";
import {
  invalidationEventSchema,
  publicCacheTag,
} from "@portfolio/contracts/content";
import { randomUUID } from "node:crypto";

/**
 * Portfolio CMS persistence for M7's site-shell slice.
 *
 * This deliberately does not expose Prisma delegates to controllers. Every
 * write records an immutable revision, an append-only audit event, and raises
 * a conflict if the `If-Match` version no longer describes the target row.
 */
export class AdminPortfolioService {
  public constructor(private readonly database: Database) {}

  async readSettings(): Promise<unknown> {
    return this.database.siteSettings.findUniqueOrThrow({
      where: { id: 1 },
      include: { translations: { orderBy: { locale: "asc" } } },
    });
  }

  /** Safe ADMIN-003 summary: counts and event categories only, never bodies or credentials. */
  async dashboard(): Promise<unknown> {
    const [drafts, scheduled, contacts, recentEdits, securityEvents, outbox, jobs] = await Promise.all([
      this.database.postTranslation.count({ where: { status: "DRAFT", archivedAt: null } }),
      this.database.postTranslation.count({ where: { status: "SCHEDULED", archivedAt: null } }),
      this.database.contactMessage.count({ where: { deletionDueAt: { gt: new Date() } } }),
      this.database.contentRevision.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, entityType: true, entityId: true, action: true, createdAt: true, actor: { select: { displayName: true } } } }),
      this.database.auditEvent.findMany({ where: { outcome: "FAILURE" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, eventType: true, targetType: true, outcome: true, createdAt: true } }),
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
      const parent = await tx.siteSettings.findUnique({ where: { id: 1 } });
      if (parent === null) throw new Error("Site settings singleton is missing.");
      const before = await tx.siteSettingsTranslation.findUnique({
        where: { siteSettingsId_locale: { siteSettingsId: 1, locale } },
      });
      await requireVersion(tx.siteSettings, "SiteSettings", "1", version, {});
      const after = await tx.siteSettingsTranslation.upsert({
        where: { siteSettingsId_locale: { siteSettingsId: 1, locale } },
        create: { siteSettingsId: 1, locale, ...input },
        update: input,
      });
      const current = await tx.siteSettings.findUniqueOrThrow({ where: { id: 1 } });
      await this.recordChange(tx, actorId, "SiteSettingsTranslation", `${locale}`, current.version, "UPDATE", before, after);
      return { translation: after, version: current.version };
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
      await requireVersion(tx.pageSection, "PageSection", id, version, {});
      const translation = await tx.pageSectionTranslation.upsert({
        where: { sectionId_locale: { sectionId: id, locale } },
        create: { sectionId: id, locale, ...input.translation },
        update: input.translation,
      });
      const after = await tx.pageSection.findUniqueOrThrow({ where: { id } });
      await this.recordChange(tx, actorId, "PageSectionTranslation", `${id}:${locale}`, after.version, "UPDATE", before, translation);
      return { translation, version: after.version };
    });
  }

  async listNavigation(): Promise<unknown> {
    return this.database.navItem.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
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
    return this.database.socialLink.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
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
      const before = await delegate.findUnique({ where: { id } });
      if (before === null) throw new OptimisticConcurrencyError(entityType, id, version, null);
      await requireVersion(delegate, entityType, id, version, data);
      const after = await delegate.findUniqueOrThrow({ where: { id } });
      await this.recordChange(tx, actorId, entityType, id, after.version, "UPDATE", before, after);
      return after;
    });
  }

  private async recordChange(
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

function invalidationRows(tx: any, entityType: string): Promise<unknown>[] {
  const namespaces = entityType === "AppearanceSettings"
    ? ["appearance"]
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
  return value === null ? null : JSON.parse(JSON.stringify(value)) as unknown;
}

function redactSettings(value: Record<string, unknown>) {
  const safe = { ...value };
  delete safe.contactRecipientEmail;
  delete safe.searchConsoleTokens;
  delete safe.birthDate;
  return safe;
}
