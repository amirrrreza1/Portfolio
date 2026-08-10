import { type MigrationPlan } from "./index.js";

export interface ReconciliationReport {
  readonly migrationVersion: string;
  readonly sourceChecksum: string;
  readonly counts: MigrationPlan["counts"];
  readonly generatedProjectSlugs: readonly {
    readonly legacyId: number;
    readonly slug: string;
  }[];
  readonly certificateSources: readonly {
    readonly legacyId: number;
    readonly issuedAt: string;
    readonly sourcePath: string;
  }[];
  readonly errors: readonly MigrationPlan["issues"][number][];
  readonly warnings: readonly MigrationPlan["issues"][number][];
}

/** A serializable review artifact; no migration write is possible from it. */
export function createReconciliationReport(
  plan: MigrationPlan
): ReconciliationReport {
  return {
    migrationVersion: plan.version,
    sourceChecksum: plan.sourceChecksum,
    counts: plan.counts,
    generatedProjectSlugs: plan.projects.map((project) => ({
      legacyId: project.legacyId,
      slug: project.slug,
    })),
    certificateSources: plan.certificates.map((certificate) => ({
      legacyId: certificate.legacyId,
      issuedAt: certificate.issuedAt,
      sourcePath: certificate.sourcePath,
    })),
    errors: plan.issues.filter((issue) => issue.severity === "error"),
    warnings: plan.issues.filter((issue) => issue.severity === "warning"),
  };
}

export function serializeReconciliationReport(plan: MigrationPlan): string {
  return JSON.stringify(createReconciliationReport(plan), null, 2) + "\n";
}
