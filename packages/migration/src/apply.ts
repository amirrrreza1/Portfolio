import {
  assertMigrationReady,
  planLegacyMigration,
  type LegacySnapshot,
  type MigrationPlan,
} from "./index.js";

export interface LegacyMediaReferences {
  readonly certificatesBySourcePath: ReadonlyMap<string, VerifiedLegacyMedia>;
  readonly resume: VerifiedLegacyMedia;
}

/** Metadata emitted only after M1's verified object-ingestion boundary. */
export interface VerifiedLegacyMedia {
  readonly id: string;
  readonly storageKey: string;
  readonly displayName: string;
  readonly kind: "DOCUMENT" | "IMAGE";
  readonly mimeType: string;
  readonly byteSize: bigint;
  readonly checksumSha256: string;
  readonly visibility: "PUBLIC" | "PRIVATE";
}

export interface LegacyMigrationTransaction {
  appliedChecksum(version: string): Promise<string | null>;
  recordAppliedMigration(input: {
    readonly version: string;
    readonly checksum: string;
    readonly report: unknown;
  }): Promise<void>;
  upsertVerifiedMedia(input: VerifiedLegacyMedia): Promise<string>;
  upsertSkillCategory(input: {
    readonly legacyId: number;
    readonly key: string;
    readonly name: string;
    readonly sortOrder: number;
  }): Promise<string>;
  upsertSkill(input: {
    readonly legacyId: number;
    readonly categoryId: string;
    readonly name: string;
    readonly color: string;
    readonly sortOrder: number;
  }): Promise<string>;
  upsertProject(input: {
    readonly legacyId: number;
    readonly slug: string;
    readonly status: "COMPLETED";
    readonly demoUrl: string | null;
    readonly repositoryUrl: string | null;
    readonly title: string;
    readonly summary: string;
    readonly sortOrder: number;
  }): Promise<string>;
  replaceProjectSkills(
    projectId: string,
    skillIds: readonly string[]
  ): Promise<void>;
  upsertCertificate(input: {
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
  }): Promise<void>;
  upsertQuote(input: {
    readonly legacyId: number;
    readonly text: string;
    readonly author: string;
    readonly sortOrder: number;
  }): Promise<void>;
  activateResume(input: {
    readonly mediaId: string;
    readonly label: string;
    readonly publicFilename: string;
  }): Promise<void>;
}

export interface LegacyMigrationStore {
  /** Read before object ingestion so a successful replay cannot create blobs. */
  appliedChecksum(version: string): Promise<string | null>;
  transaction<T>(
    operation: (transaction: LegacyMigrationTransaction) => Promise<T>
  ): Promise<T>;
}

export interface AppliedLegacyMigration {
  readonly applied: boolean;
  readonly plan: MigrationPlan;
}

/**
 * Applies all portfolio rows in a single database transaction through a narrow
 * port. The database adapter owns Prisma details; media is required up front so
 * no certificate/resume row can be written without verified object metadata.
 */
export async function applyLegacyMigration(
  store: LegacyMigrationStore,
  snapshot: LegacySnapshot,
  media: LegacyMediaReferences
): Promise<AppliedLegacyMigration> {
  const plan = planLegacyMigration(snapshot);
  assertMigrationReady(plan);
  assertMediaCoverage(plan, media);

  return store.transaction(async (transaction) => {
    const previous = await transaction.appliedChecksum(plan.version);
    if (previous === plan.sourceChecksum) return { applied: false, plan };
    if (previous !== null) {
      throw new Error(
        "Migration version " +
          plan.version +
          " was applied with a different source checksum."
      );
    }

    const certificateMediaIds = new Map<string, string>();
    for (const certificate of plan.certificates) {
      const verified = mediaForCertificate(certificate.sourcePath, media);
      certificateMediaIds.set(
        certificate.sourcePath,
        await transaction.upsertVerifiedMedia(verified)
      );
    }
    const resumeMediaId = await transaction.upsertVerifiedMedia(media.resume);

    const skillIds = new Map<number, string>();
    for (const [categoryIndex, category] of snapshot.skills.entries()) {
      const key = category.category
        .normalize("NFKD")
        .replace(/[\p{M}]/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const categoryId = await transaction.upsertSkillCategory({
        legacyId: category.id,
        key,
        name: category.category,
        sortOrder: categoryIndex,
      });
      for (const [skillIndex, skill] of category.items.entries()) {
        skillIds.set(
          skill.id,
          await transaction.upsertSkill({
            legacyId: skill.id,
            categoryId,
            name: skill.name,
            color: skill.color.toLowerCase(),
            sortOrder: skillIndex,
          })
        );
      }
    }

    for (const [projectIndex, project] of snapshot.projects.entries()) {
      const planned = plan.projects.find(
        (candidate) => candidate.legacyId === project.id
      );
      if (planned === undefined) {
        throw new Error(
          "Migration plan is missing project " + project.id + "."
        );
      }
      const projectId = await transaction.upsertProject({
        legacyId: project.id,
        slug: planned.slug,
        status: planned.status,
        demoUrl: planned.demoUrl,
        repositoryUrl: planned.repositoryUrl,
        title: project.title,
        summary: project.description,
        sortOrder: projectIndex,
      });
      await transaction.replaceProjectSkills(
        projectId,
        planned.skillLegacyIds.map((id) => {
          const skillId = skillIds.get(id);
          if (skillId === undefined)
            throw new Error("Missing skill " + id + ".");
          return skillId;
        })
      );
    }

    for (const [
      certificateIndex,
      certificate,
    ] of snapshot.certificates.entries()) {
      const planned = plan.certificates.find(
        (candidate) => candidate.legacyId === certificate.id
      );
      if (planned === undefined) {
        throw new Error(
          "Migration plan is missing certificate " + certificate.id + "."
        );
      }
      const mediaId = certificateMediaIds.get(planned.sourcePath);
      if (mediaId === undefined) {
        throw new Error("Missing media for " + planned.sourcePath + ".");
      }
      await transaction.upsertCertificate({
        legacyId: certificate.id,
        title: certificate.title,
        description: certificate.description,
        issuerName: certificate.institute,
        issuerUrl: certificate.instituteLink,
        instructorName: certificate.teacher,
        instructorUrl: certificate.teacherLink,
        scoreText: certificate.score,
        issuedAt: planned.issuedAt,
        mediaId,
        sortOrder: certificateIndex,
      });
    }

    for (const [quoteIndex, quote] of snapshot.quotes.entries()) {
      await transaction.upsertQuote({
        legacyId: quote.id,
        text: quote.text,
        author: quote.author,
        sortOrder: quoteIndex,
      });
    }

    await transaction.activateResume({
      mediaId: resumeMediaId,
      label: "Frontend CV",
      publicFilename: "Amirreza-Azarioun-Resume.pdf",
    });
    await transaction.recordAppliedMigration({
      version: plan.version,
      checksum: plan.sourceChecksum,
      report: plan,
    });
    return { applied: true, plan };
  });
}

function assertMediaCoverage(
  plan: MigrationPlan,
  media: LegacyMediaReferences
): void {
  if (!media.resume?.id)
    throw new Error("A verified resume media ID is required.");
  for (const certificate of plan.certificates) {
    if (!media.certificatesBySourcePath.has(certificate.sourcePath)) {
      throw new Error(
        "Verified certificate media is required for " +
          certificate.sourcePath +
          "."
      );
    }
  }
}

function mediaForCertificate(
  sourcePath: string,
  media: LegacyMediaReferences
): VerifiedLegacyMedia {
  const verified = media.certificatesBySourcePath.get(sourcePath);
  if (verified === undefined) {
    throw new Error(
      "Verified certificate media is required for " + sourcePath + "."
    );
  }
  return verified;
}
