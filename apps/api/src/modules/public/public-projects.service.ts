import { Logger } from "@nestjs/common";
import type { Database } from "@portfolio/database";
import {
  publicProjectsSchema,
  type PublicProjects,
} from "@portfolio/contracts/portfolio";
import type { Locale } from "@portfolio/contracts/common";

export interface PublicProjectsRead {
  readonly data: PublicProjects;
  readonly lastModified: Date;
}

type Translation = {
  readonly locale: "en" | "fa";
  readonly updatedAt: Date;
};

/**
 * Database-backed published project read model.
 *
 * The Prisma selections are the security boundary: legacy IDs, versions,
 * archive metadata, and every unrelated relation are absent before the DTO is
 * constructed. The shared strict schema validates the final object again so a
 * future query edit cannot silently widen the public response.
 */
export class PublicProjectsService {
  private static readonly logger = new Logger(PublicProjectsService.name);

  public constructor(private readonly database: Database) {}

  async read(locale: Locale): Promise<PublicProjectsRead> {
    const locales =
      locale === "en" ? (["en"] as const) : (["fa", "en"] as const);

    const [categoryRows, projectRows] = await Promise.all([
      this.database.skillCategory.findMany({
        where: { enabled: true },
        orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
        select: {
          id: true,
          key: true,
          updatedAt: true,
          translations: {
            where: { locale: { in: [...locales] } },
            select: { locale: true, name: true, updatedAt: true },
          },
          skills: {
            where: { enabled: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              color: true,
              updatedAt: true,
            },
          },
        },
      }),
      this.database.project.findMany({
        where: {
          enabled: true,
          archivedAt: null,
          status: { not: "ARCHIVED" },
        },
        orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
        select: {
          id: true,
          slug: true,
          status: true,
          demoUrl: true,
          repositoryUrl: true,
          featured: true,
          updatedAt: true,
          translations: {
            where: { locale: { in: [...locales] } },
            select: {
              locale: true,
              title: true,
              summary: true,
              updatedAt: true,
            },
          },
          skills: {
            orderBy: { sortOrder: "asc" },
            select: { skillId: true },
          },
        },
      }),
    ]);

    const enabledSkillIds = new Set(
      categoryRows.flatMap((category) =>
        category.skills.map((skill) => skill.id)
      )
    );

    const skillCategories = categoryRows.flatMap((category) => {
      const translation = findTranslation(category.translations, locale);
      if (translation === null) {
        PublicProjectsService.logger.error(
          `Excluding skill category ${category.id} from public discovery: missing English translation.`
        );
        return [];
      }
      return [
        {
          id: category.id,
          key: category.key,
          name: translation.name,
          skills: category.skills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            color: skill.color,
          })),
        },
      ];
    });

    const projects = projectRows.flatMap((project) => {
      const translation = findTranslation(project.translations, locale);
      if (translation === null) {
        PublicProjectsService.logger.error(
          `Excluding project ${project.id} from public discovery: missing English translation.`
        );
        return [];
      }
      return [
        {
          id: project.id,
          title: translation.title,
          summary: translation.summary,
          status: project.status,
          demoUrl: project.demoUrl,
          repositoryUrl: project.repositoryUrl,
          featured: project.featured,
          skillIds: project.skills
            .map((relation) => relation.skillId)
            .filter((skillId) => enabledSkillIds.has(skillId)),
        },
      ];
    });

    const lastModified = latestDate([
      ...categoryRows.flatMap((category) => [
        category.updatedAt,
        ...category.translations.map((translation) => translation.updatedAt),
        ...category.skills.map((skill) => skill.updatedAt),
      ]),
      ...projectRows.flatMap((project) => [
        project.updatedAt,
        ...project.translations.map((translation) => translation.updatedAt),
      ]),
    ]);

    return {
      data: publicProjectsSchema.parse({
        locale,
        projects,
        skillCategories,
      }),
      lastModified,
    };
  }
}

/**
 * A public collection is read by every visitor, so one unfinished record must
 * not decide whether the rest of them render. Authoring a record before its
 * English translation exists is a normal CMS state; the record is simply not
 * published yet, and the caller excludes it rather than failing the request.
 */
function findTranslation<T extends Translation>(
  translations: readonly T[],
  locale: Locale
): T | null {
  return (
    translations.find((translation) => translation.locale === locale) ??
    translations.find((translation) => translation.locale === "en") ??
    null
  );
}

function latestDate(values: readonly Date[]): Date {
  if (values.length === 0) return new Date(0);
  return new Date(Math.max(...values.map((value) => value.getTime())));
}
