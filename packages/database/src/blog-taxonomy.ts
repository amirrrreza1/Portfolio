import {
  adminTaxonomySchema,
  adminTaxonomyTranslationSchemaFor,
  type AdminTaxonomy,
  type AdminTaxonomyTranslation,
  type Locale,
} from "@portfolio/contracts";

import type { Database } from "./client.js";

/**
 * Blog categories and tags.
 *
 * The two are structurally identical — a keyed, ordered, enable-able row with
 * per-locale translations — and are deliberately implemented once rather than
 * twice. They differ only in cardinality (a post has one category and many
 * tags), and that difference lives in the article store's frontmatter
 * resolution, not here.
 *
 * Nothing in this module deletes. `Category` is `onDelete: Restrict` from
 * `Post` and `Tag` is `Restrict` from `PostTag`, because a taxonomy row is
 * referenced by every article that ever used it. Disabling removes it from
 * public discovery and leaves those articles intact.
 */
export type TaxonomyKind = "category" | "tag";

export class TaxonomyNotFoundError extends Error {
  public constructor(
    readonly kind: TaxonomyKind,
    readonly id: string
  ) {
    super(`No such ${kind}.`);
    this.name = "TaxonomyNotFoundError";
  }
}

export class TaxonomyVersionConflictError extends Error {
  public constructor(
    readonly expectedVersion: number,
    readonly currentVersion: number | null
  ) {
    super("This taxonomy row changed after the edit began.");
    this.name = "TaxonomyVersionConflictError";
  }
}

export function createBlogTaxonomyStore(database: Database) {
  const table = (kind: TaxonomyKind): any =>
    kind === "category" ? database.category : database.tag;
  const translationTable = (kind: TaxonomyKind): any =>
    kind === "category"
      ? database.categoryTranslation
      : database.tagTranslation;
  const foreignKey = (kind: TaxonomyKind): "categoryId" | "tagId" =>
    kind === "category" ? "categoryId" : "tagId";

  return {
    list: async (kind: TaxonomyKind) => {
      const rows = await table(kind).findMany({
        orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
        include: { translations: { orderBy: { locale: "asc" } } },
      });
      return rows.map((row: any) => ({
        id: row.id,
        key: row.key,
        enabled: row.enabled,
        sortOrder: row.sortOrder,
        version: row.version,
        postCount: undefined,
        translations: row.translations.map((translation: any) => ({
          locale: translation.locale,
          name: translation.name,
          slug: translation.slug,
          description: translation.description,
        })),
      }));
    },

    create: async (
      kind: TaxonomyKind,
      actorId: string,
      input: AdminTaxonomy
    ) => {
      const value = adminTaxonomySchema.parse(input);
      return database.$transaction(async (prisma: any) => {
        const created = await (
          kind === "category" ? prisma.category : prisma.tag
        ).create({ data: value });
        await writeAudit(prisma, actorId, kind, "create", created);
        return created;
      });
    },

    update: async (
      kind: TaxonomyKind,
      actorId: string,
      id: string,
      version: number,
      input: AdminTaxonomy
    ) => {
      const value = adminTaxonomySchema.parse(input);
      return database.$transaction(async (prisma: any) => {
        const model = kind === "category" ? prisma.category : prisma.tag;
        const changed = await model.updateMany({
          where: { id, version },
          data: { ...value, version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          const current = await model.findUnique({
            where: { id },
            select: { version: true },
          });
          if (current === null) throw new TaxonomyNotFoundError(kind, id);
          throw new TaxonomyVersionConflictError(version, current.version);
        }
        const after = await model.findUniqueOrThrow({ where: { id } });
        await writeAudit(prisma, actorId, kind, "update", after);
        return after;
      });
    },

    /**
     * Upserts one locale of a taxonomy row.
     *
     * The parent's version is checked rather than the translation's: the two
     * locales of one category are edited from the same screen and share an
     * enable flag and sort order, so treating the row as the unit of
     * concurrency is what the editor actually sees. Article translations are
     * the opposite case — genuinely independent — and are versioned per
     * locale.
     */
    saveTranslation: async (
      kind: TaxonomyKind,
      actorId: string,
      id: string,
      locale: Locale,
      version: number,
      input: AdminTaxonomyTranslation
    ) => {
      const value = adminTaxonomyTranslationSchemaFor(locale).parse(input);
      return database.$transaction(async (prisma: any) => {
        const model = kind === "category" ? prisma.category : prisma.tag;
        const parent = await model.findUnique({
          where: { id },
          select: { version: true },
        });
        if (parent === null) throw new TaxonomyNotFoundError(kind, id);
        if (parent.version !== version) {
          throw new TaxonomyVersionConflictError(version, parent.version);
        }
        const translations =
          kind === "category"
            ? prisma.categoryTranslation
            : prisma.tagTranslation;
        const key = foreignKey(kind);
        const saved = await translations.upsert({
          where:
            kind === "category"
              ? { categoryId_locale: { categoryId: id, locale } }
              : { tagId_locale: { tagId: id, locale } },
          update: value,
          create: { [key]: id, locale, ...value },
        });
        // The parent's version advances so a second locale saved from a stale
        // screen is refused rather than silently applied.
        await model.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await writeAudit(prisma, actorId, kind, "translate", {
          id,
          locale,
          slug: value.slug,
        });
        return saved;
      });
    },

    translationTable,
    table,
  };
}

async function writeAudit(
  prisma: any,
  actorId: string,
  kind: TaxonomyKind,
  action: string,
  target: { readonly id: string; readonly [key: string]: unknown }
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorId,
      eventType: `blog.${kind}.${action}`,
      targetType: kind === "category" ? "Category" : "Tag",
      targetId: target.id,
      outcome: "SUCCESS",
      metadata: {
        ...(typeof target.key === "string" ? { key: target.key } : {}),
        ...(typeof target.locale === "string" ? { locale: target.locale } : {}),
      },
    },
  });
}
