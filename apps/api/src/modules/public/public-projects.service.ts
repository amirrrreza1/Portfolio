import type { Database } from "@portfolio/database";
import {
  publicProjectDetailSchema,
  publicProjectsSchema,
  type PublicProjectDetail,
  type PublicProjectImage,
  type PublicProjects,
} from "@portfolio/contracts/portfolio";
import type { Locale } from "@portfolio/contracts/common";
import { renderMarkdownBody } from "@portfolio/markdown";

import type { PublicMediaReader } from "./public-media.reader.js";

export interface PublicProjectsRead {
  readonly data: PublicProjects;
  readonly lastModified: Date;
}

export interface PublicProjectDetailRead {
  readonly data: PublicProjectDetail;
  readonly lastModified: Date;
}

export interface PublicProjectImageRead {
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
  readonly checksumSha256: string;
  readonly lastModified: Date;
  readonly readBytes: () => Promise<Uint8Array>;
}

type Translation = {
  readonly locale: "en" | "fa";
  readonly updatedAt: Date;
};

type ProjectImageRow = {
  readonly storageKey: string;
  readonly mimeType: string;
  readonly byteSize: bigint;
  readonly checksumSha256: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly altText: string | null;
  readonly kind: string;
  readonly processingState: string;
  readonly visibility: string;
  readonly archivedAt: Date | null;
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
  public constructor(
    private readonly database: Database,
    private readonly media: PublicMediaReader
  ) {}

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
          image: {
            select: {
              storageKey: true,
              mimeType: true,
              byteSize: true,
              checksumSha256: true,
              width: true,
              height: true,
              altText: true,
              kind: true,
              processingState: true,
              visibility: true,
              archivedAt: true,
              updatedAt: true,
            },
          },
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

    const skillCategories = categoryRows.map((category) => ({
      id: category.id,
      key: category.key,
      name: resolveTranslation(category.translations, locale).name,
      skills: category.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        color: skill.color,
      })),
    }));

    const projects = projectRows.map((project) => {
      const translation = resolveTranslation(project.translations, locale);
      return {
        id: project.id,
        slug: project.slug,
        title: translation.title,
        summary: translation.summary,
        status: project.status,
        demoUrl: project.demoUrl,
        repositoryUrl: project.repositoryUrl,
        featured: project.featured,
        skillIds: project.skills
          .map((relation) => relation.skillId)
          .filter((skillId) => enabledSkillIds.has(skillId)),
        image: toPublicImage(project.image, project.slug, translation.title),
      };
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
        ...(isPublicImageRow(project.image) ? [project.image.updatedAt] : []),
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

  async readDetail(
    locale: Locale,
    slug: string
  ): Promise<PublicProjectDetailRead | null> {
    const locales =
      locale === "en" ? (["en"] as const) : (["fa", "en"] as const);
    const project = await this.database.project.findFirst({
      where: {
        slug,
        enabled: true,
        archivedAt: null,
        status: { not: "ARCHIVED" },
      },
      select: {
        id: true,
        slug: true,
        status: true,
        demoUrl: true,
        repositoryUrl: true,
        featured: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
        translations: {
          where: { locale: { in: [...locales] } },
          select: {
            locale: true,
            title: true,
            summary: true,
            longDescription: true,
            updatedAt: true,
          },
        },
        image: {
          select: {
            storageKey: true,
            mimeType: true,
            byteSize: true,
            checksumSha256: true,
            width: true,
            height: true,
            altText: true,
            kind: true,
            processingState: true,
            visibility: true,
            archivedAt: true,
            updatedAt: true,
          },
        },
        skills: {
          where: {
            skill: { enabled: true, category: { enabled: true } },
          },
          orderBy: { sortOrder: "asc" },
          select: {
            skillId: true,
            skill: {
              select: { name: true, color: true, updatedAt: true },
            },
          },
        },
      },
    });
    if (project === null) return null;

    const translation = resolveTranslation(project.translations, locale);
    if (translation.longDescription !== null) {
      await renderMarkdownBody(translation.longDescription);
    }
    const skills = project.skills.map((relation) => ({
      id: relation.skillId,
      name: relation.skill.name,
      color: relation.skill.color,
    }));
    const image = toPublicImage(project.image, project.slug, translation.title);
    return {
      data: publicProjectDetailSchema.parse({
        locale,
        project: {
          id: project.id,
          slug: project.slug,
          title: translation.title,
          summary: translation.summary,
          status: project.status,
          demoUrl: project.demoUrl,
          repositoryUrl: project.repositoryUrl,
          featured: project.featured,
          skillIds: skills.map((skill) => skill.id),
          image,
          longDescription: translation.longDescription,
          startedAt:
            project.startedAt === null ? null : dateOnly(project.startedAt),
          completedAt:
            project.completedAt === null ? null : dateOnly(project.completedAt),
          skills,
        },
      }),
      lastModified: latestDate([
        project.updatedAt,
        ...project.translations.map((value) => value.updatedAt),
        ...project.skills.map((relation) => relation.skill.updatedAt),
        ...(image === null || project.image === null
          ? []
          : [project.image.updatedAt]),
      ]),
    };
  }

  async readImage(slug: string): Promise<PublicProjectImageRead | null> {
    const project = await this.database.project.findFirst({
      where: {
        slug,
        enabled: true,
        archivedAt: null,
        status: { not: "ARCHIVED" },
        image: {
          is: {
            kind: "IMAGE",
            processingState: "VERIFIED",
            visibility: "PUBLIC",
            archivedAt: null,
          },
        },
      },
      select: {
        updatedAt: true,
        image: {
          select: {
            storageKey: true,
            mimeType: true,
            byteSize: true,
            checksumSha256: true,
            width: true,
            height: true,
            altText: true,
            kind: true,
            processingState: true,
            visibility: true,
            archivedAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (project === null || !isPublicImageRow(project.image)) return null;
    const image = project.image;
    const mimeType = parseImageMimeType(image.mimeType);
    const expectedSize = Number(image.byteSize);
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
      throw new Error("A public project image has an invalid byte size.");
    }
    if (!/^[0-9a-f]{64}$/i.test(image.checksumSha256)) {
      throw new Error("A public project image has an invalid checksum.");
    }
    return {
      mimeType,
      checksumSha256: image.checksumSha256,
      lastModified: latestDate([project.updatedAt, image.updatedAt]),
      readBytes: async () => {
        const bytes = await this.media.read(image.storageKey);
        if (bytes.byteLength !== expectedSize) {
          throw new Error(
            "A public project image object does not match its metadata."
          );
        }
        return bytes;
      },
    };
  }
}

function toPublicImage(
  image: ProjectImageRow | null,
  slug: string,
  title: string
): PublicProjectImage | null {
  if (!isPublicImageRow(image)) return null;
  const dimensions = readImageDimensions(image);
  return {
    src: `/api/v1/public/projects/${slug}/image`,
    altText: image.altText?.trim() || `${title} project cover`,
    mimeType: parseImageMimeType(image.mimeType),
    width: dimensions.width,
    height: dimensions.height,
  };
}

function isPublicImageRow(
  image: ProjectImageRow | null
): image is ProjectImageRow {
  return (
    image !== null &&
    image.kind === "IMAGE" &&
    image.processingState === "VERIFIED" &&
    image.visibility === "PUBLIC" &&
    image.archivedAt === null
  );
}

function parseImageMimeType(
  value: string
): "image/jpeg" | "image/png" | "image/webp" {
  if (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp"
  ) {
    return value;
  }
  throw new Error(
    "A verified public project image has an unsupported MIME type."
  );
}

function readImageDimensions(image: ProjectImageRow): {
  readonly width: number | null;
  readonly height: number | null;
} {
  if (image.width === null && image.height === null) {
    return { width: null, height: null };
  }
  if (
    image.width === null ||
    image.height === null ||
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    throw new Error("A verified public project image has invalid dimensions.");
  }
  return { width: image.width, height: image.height };
}

function resolveTranslation<T extends Translation>(
  translations: readonly T[],
  locale: Locale
): T {
  const resolved =
    translations.find((translation) => translation.locale === locale) ??
    translations.find((translation) => translation.locale === "en");

  if (resolved === undefined) {
    throw new Error(
      "Public portfolio record is missing its required English translation."
    );
  }

  return resolved;
}

function latestDate(values: readonly Date[]): Date {
  if (values.length === 0) return new Date(0);
  return new Date(Math.max(...values.map((value) => value.getTime())));
}

function dateOnly(value: Date): string {
  return value.toISOString().substring(0, 10);
}
