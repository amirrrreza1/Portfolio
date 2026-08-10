import type {
  LegacyMigrationStore,
  LegacyMigrationTransaction,
  VerifiedLegacyMedia,
} from "@portfolio/migration";

import type { Database } from "./client.js";

/**
 * Prisma implementation of M2's narrow migration port. Keeping the migration
 * algorithm in @portfolio/migration lets it be tested without a database while
 * this adapter proves every applied row shares one Prisma transaction.
 */
export function createLegacyMigrationStore(
  database: Database
): LegacyMigrationStore {
  return {
    appliedChecksum: async (version) =>
      (await database.dataMigration.findUnique({ where: { version } }))
        ?.checksum ?? null,
    transaction: (operation) =>
      database.$transaction(async (prisma) =>
        operation(new PrismaMigrationTransaction(prisma))
      ),
  };
}

class PrismaMigrationTransaction implements LegacyMigrationTransaction {
  constructor(private readonly prisma: any) {}

  async appliedChecksum(version: string): Promise<string | null> {
    return (
      (await this.prisma.dataMigration.findUnique({ where: { version } }))
        ?.checksum ?? null
    );
  }

  async recordAppliedMigration(input: {
    readonly version: string;
    readonly checksum: string;
    readonly report: unknown;
  }): Promise<void> {
    await this.prisma.dataMigration.create({
      data: {
        version: input.version,
        checksum: input.checksum,
        report: input.report,
      },
    });
  }

  async upsertVerifiedMedia(input: VerifiedLegacyMedia): Promise<string> {
    const media = await this.prisma.mediaAsset.upsert({
      where: { id: input.id },
      update: {
        storageKey: input.storageKey,
        displayName: input.displayName,
        kind: input.kind,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        visibility: input.visibility,
        processingState: "VERIFIED",
      },
      create: {
        id: input.id,
        storageKey: input.storageKey,
        displayName: input.displayName,
        kind: input.kind,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        visibility: input.visibility,
        processingState: "VERIFIED",
      },
    });
    return media.id;
  }

  async upsertSkillCategory(input: {
    readonly legacyId: number;
    readonly key: string;
    readonly name: string;
    readonly sortOrder: number;
  }): Promise<string> {
    const category = await this.prisma.skillCategory.upsert({
      where: { legacyId: input.legacyId },
      update: { key: input.key, sortOrder: input.sortOrder, enabled: true },
      create: {
        legacyId: input.legacyId,
        key: input.key,
        sortOrder: input.sortOrder,
        enabled: true,
      },
    });
    await this.prisma.skillCategoryTranslation.upsert({
      where: {
        categoryId_locale: { categoryId: category.id, locale: "en" },
      },
      update: { name: input.name },
      create: { categoryId: category.id, locale: "en", name: input.name },
    });
    return category.id;
  }

  async upsertSkill(input: {
    readonly legacyId: number;
    readonly categoryId: string;
    readonly name: string;
    readonly color: string;
    readonly sortOrder: number;
  }): Promise<string> {
    const skill = await this.prisma.skill.upsert({
      where: { legacyId: input.legacyId },
      update: {
        categoryId: input.categoryId,
        name: input.name,
        color: input.color,
        sortOrder: input.sortOrder,
        enabled: true,
      },
      create: {
        legacyId: input.legacyId,
        categoryId: input.categoryId,
        name: input.name,
        color: input.color,
        sortOrder: input.sortOrder,
        enabled: true,
      },
    });
    return skill.id;
  }

  async upsertProject(input: {
    readonly legacyId: number;
    readonly slug: string;
    readonly status: "COMPLETED";
    readonly demoUrl: string | null;
    readonly repositoryUrl: string | null;
    readonly title: string;
    readonly summary: string;
    readonly sortOrder: number;
  }): Promise<string> {
    const project = await this.prisma.project.upsert({
      where: { legacyId: input.legacyId },
      update: {
        slug: input.slug,
        status: input.status,
        demoUrl: input.demoUrl,
        repositoryUrl: input.repositoryUrl,
        sortOrder: input.sortOrder,
        enabled: true,
      },
      create: {
        legacyId: input.legacyId,
        slug: input.slug,
        status: input.status,
        demoUrl: input.demoUrl,
        repositoryUrl: input.repositoryUrl,
        sortOrder: input.sortOrder,
        enabled: true,
      },
    });
    await this.prisma.projectTranslation.upsert({
      where: { projectId_locale: { projectId: project.id, locale: "en" } },
      update: { title: input.title, summary: input.summary },
      create: {
        projectId: project.id,
        locale: "en",
        title: input.title,
        summary: input.summary,
      },
    });
    return project.id;
  }

  async replaceProjectSkills(
    projectId: string,
    skillIds: readonly string[]
  ): Promise<void> {
    await this.prisma.projectSkill.deleteMany({ where: { projectId } });
    await this.prisma.projectSkill.createMany({
      data: skillIds.map((skillId, sortOrder) => ({
        projectId,
        skillId,
        sortOrder,
      })),
    });
  }

  async upsertCertificate(input: {
    readonly legacyId: number;
    readonly title: string;
    readonly description: string;
    readonly issuerName: string;
    readonly issuerUrl: string;
    readonly instructorName: string;
    readonly instructorUrl: string;
    readonly scoreText: string;
    readonly issuedAt: string;
    readonly mediaId: string;
    readonly sortOrder: number;
  }): Promise<void> {
    const certificate = await this.prisma.certificate.upsert({
      where: { legacyId: input.legacyId },
      update: {
        issuerName: input.issuerName,
        issuerUrl: input.issuerUrl,
        instructorName: input.instructorName,
        instructorUrl: input.instructorUrl,
        scoreText: input.scoreText,
        issuedAt: new Date(input.issuedAt + "T00:00:00.000Z"),
        mediaId: input.mediaId,
        sortOrder: input.sortOrder,
        enabled: true,
      },
      create: {
        legacyId: input.legacyId,
        issuerName: input.issuerName,
        issuerUrl: input.issuerUrl,
        instructorName: input.instructorName,
        instructorUrl: input.instructorUrl,
        scoreText: input.scoreText,
        issuedAt: new Date(input.issuedAt + "T00:00:00.000Z"),
        mediaId: input.mediaId,
        sortOrder: input.sortOrder,
        enabled: true,
      },
    });
    await this.prisma.certificateTranslation.upsert({
      where: {
        certificateId_locale: { certificateId: certificate.id, locale: "en" },
      },
      update: { title: input.title, description: input.description },
      create: {
        certificateId: certificate.id,
        locale: "en",
        title: input.title,
        description: input.description,
      },
    });
  }

  async upsertQuote(input: {
    readonly legacyId: number;
    readonly text: string;
    readonly author: string;
    readonly sortOrder: number;
  }): Promise<void> {
    await this.prisma.quote.upsert({
      where: { legacyId: input.legacyId },
      update: {
        textByLocale: { en: input.text },
        author: input.author,
        sortOrder: input.sortOrder,
        enabled: true,
      },
      create: {
        legacyId: input.legacyId,
        textByLocale: { en: input.text },
        author: input.author,
        sortOrder: input.sortOrder,
        enabled: true,
      },
    });
  }

  async activateResume(input: {
    readonly mediaId: string;
    readonly label: string;
    readonly publicFilename: string;
  }): Promise<void> {
    const active = await this.prisma.resumeVersion.findFirst({
      where: { activatedAt: { not: null }, retiredAt: null },
    });
    if (active?.mediaAssetId === input.mediaId) return;
    if (active !== null) {
      await this.prisma.resumeVersion.update({
        where: { id: active.id },
        data: { retiredAt: new Date() },
      });
    }
    await this.prisma.resumeVersion.create({
      data: {
        mediaAssetId: input.mediaId,
        label: input.label,
        publicFilename: input.publicFilename,
        activatedAt: new Date(),
      },
    });
  }
}
