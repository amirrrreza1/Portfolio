import { createHash } from "node:crypto";

import {
  hexColorSchema,
  httpsUrlSchema,
  suggestSlug,
} from "@portfolio/contracts/common";

export {
  createReconciliationReport,
  serializeReconciliationReport,
  type ReconciliationReport,
} from "./report.js";
export {
  applyLegacyMigration,
  type AppliedLegacyMigration,
  type LegacyMediaReferences,
  type LegacyMigrationStore,
  type LegacyMigrationTransaction,
  type VerifiedLegacyMedia,
} from "./apply.js";
export {
  executeLegacyMediaMigration,
  type LegacyMediaExecutorInput,
  type LegacyMediaExecutorResult,
} from "./media-execution.js";

export const LEGACY_MIGRATION_VERSION = "2026-08-10.1";

export interface LegacyProject {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly link: string | null;
  readonly repo: string | null;
  readonly technologies: readonly number[];
  readonly status: string;
}

export interface LegacySkill {
  readonly id: number;
  readonly name: string;
  readonly color: string;
}

export interface LegacySkillCategory {
  readonly id: number;
  readonly category: string;
  readonly items: readonly LegacySkill[];
}

export interface LegacyCertificate {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly teacher: string;
  readonly teacherLink: string;
  readonly score: string;
  readonly institute: string;
  readonly instituteLink: string;
  readonly filePath: string;
  readonly date: string;
}

export interface LegacyQuote {
  readonly id: number;
  readonly text: string;
  readonly author: string;
}

export interface LegacySnapshot {
  readonly projects: readonly LegacyProject[];
  readonly skills: readonly LegacySkillCategory[];
  readonly certificates: readonly LegacyCertificate[];
  readonly quotes: readonly LegacyQuote[];
}

export interface MigrationIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly location: string;
  readonly message: string;
}

export interface PlannedProject {
  readonly legacyId: number;
  readonly slug: string;
  readonly status: "COMPLETED";
  readonly demoUrl: string | null;
  readonly repositoryUrl: string | null;
  readonly skillLegacyIds: readonly number[];
}

export interface PlannedCertificate {
  readonly legacyId: number;
  readonly issuedAt: string;
  readonly sourcePath: string;
}

export interface MigrationPlan {
  readonly version: typeof LEGACY_MIGRATION_VERSION;
  readonly sourceChecksum: string;
  readonly counts: {
    readonly projects: number;
    readonly skillCategories: number;
    readonly skills: number;
    readonly certificates: number;
    readonly quotes: number;
  };
  readonly projects: readonly PlannedProject[];
  readonly certificates: readonly PlannedCertificate[];
  readonly issues: readonly MigrationIssue[];
}

/**
 * Builds the deterministic, side-effect-free half of M2. The eventual command
 * writes this plan in one transaction only after errors are empty; warnings are
 * deliberately retained in the reconciliation report for owner review.
 */
export function planLegacyMigration(snapshot: LegacySnapshot): MigrationPlan {
  const issues: MigrationIssue[] = [];
  const skillIds = new Set<number>();
  const categoryIds = new Set<number>();
  let skillCount = 0;

  for (const category of snapshot.skills) {
    const location = "skills[" + category.id + "]";
    requirePositiveId(category.id, location, issues);
    if (categoryIds.has(category.id)) {
      error(
        issues,
        "DUPLICATE_CATEGORY_ID",
        location,
        "Category ID is duplicated."
      );
    }
    categoryIds.add(category.id);
    requireText(category.category, location + ".category", issues);

    for (const skill of category.items) {
      const skillLocation = location + ".items[" + skill.id + "]";
      requirePositiveId(skill.id, skillLocation, issues);
      if (skillIds.has(skill.id)) {
        error(
          issues,
          "DUPLICATE_SKILL_ID",
          skillLocation,
          "Skill ID is duplicated."
        );
      }
      skillIds.add(skill.id);
      skillCount += 1;
      requireText(skill.name, skillLocation + ".name", issues);

      const color = hexColorSchema.safeParse(skill.color);
      if (!color.success) {
        error(
          issues,
          "INVALID_SKILL_COLOR",
          skillLocation + ".color",
          color.error.message
        );
      } else if (color.data === "#000000") {
        warning(
          issues,
          "LOW_CONTRAST_SKILL_COLOR",
          skillLocation + ".color",
          "Black is valid source data but fails contrast on the enabled dark theme; select a replacement."
        );
      }
    }
  }

  const projectIds = new Set<number>();
  const projectSlugs = new Map<string, number>();
  const projects: PlannedProject[] = [];
  for (const project of snapshot.projects) {
    const location = "projects[" + project.id + "]";
    requirePositiveId(project.id, location, issues);
    if (projectIds.has(project.id)) {
      error(
        issues,
        "DUPLICATE_PROJECT_ID",
        location,
        "Project ID is duplicated."
      );
    }
    projectIds.add(project.id);
    requireText(project.title, location + ".title", issues);
    requireText(project.description, location + ".description", issues);

    const slug = suggestSlug(project.title, "en");
    if (slug.empty) {
      error(
        issues,
        "EMPTY_PROJECT_SLUG",
        location + ".title",
        "Title cannot produce a URL slug."
      );
    }
    const existing = projectSlugs.get(slug.slug);
    if (existing !== undefined) {
      error(
        issues,
        "PROJECT_SLUG_COLLISION",
        location + ".title",
        "Slug " +
          slug.slug +
          " also belongs to legacy project " +
          existing +
          "."
      );
    }
    projectSlugs.set(slug.slug, project.id);

    for (const skillId of project.technologies) {
      if (!skillIds.has(skillId)) {
        error(
          issues,
          "ORPHAN_PROJECT_SKILL",
          location + ".technologies",
          "Skill ID " + skillId + " does not exist in legacy skills."
        );
      }
    }

    const status = normalizeProjectStatus(
      project.status,
      location + ".status",
      issues
    );
    const demoUrl = normalizeUrl(project.link, location + ".link", issues);
    const repositoryUrl = normalizeUrl(
      project.repo,
      location + ".repo",
      issues
    );
    projects.push({
      legacyId: project.id,
      slug: slug.slug,
      status,
      demoUrl,
      repositoryUrl,
      skillLegacyIds: [...project.technologies],
    });
  }

  const certificateIds = new Set<number>();
  const certificatePaths = new Set<string>();
  const certificates: PlannedCertificate[] = [];
  for (const certificate of snapshot.certificates) {
    const location = "certificates[" + certificate.id + "]";
    requirePositiveId(certificate.id, location, issues);
    if (certificateIds.has(certificate.id)) {
      error(
        issues,
        "DUPLICATE_CERTIFICATE_ID",
        location,
        "Certificate ID is duplicated."
      );
    }
    certificateIds.add(certificate.id);
    requireText(certificate.title, location + ".title", issues);
    requireText(certificate.description, location + ".description", issues);
    validateHttps(certificate.teacherLink, location + ".teacherLink", issues);
    validateHttps(
      certificate.instituteLink,
      location + ".instituteLink",
      issues
    );
    const issuedAt = normalizeLegacyDate(
      certificate.date,
      location + ".date",
      issues
    );
    const sourcePath = normalizeCertificatePath(
      certificate.filePath,
      location + ".filePath",
      issues
    );
    if (certificatePaths.has(sourcePath)) {
      error(
        issues,
        "DUPLICATE_CERTIFICATE_PATH",
        location + ".filePath",
        "Certificate file path is duplicated."
      );
    }
    certificatePaths.add(sourcePath);
    certificates.push({ legacyId: certificate.id, issuedAt, sourcePath });
  }

  const quoteIds = new Set<number>();
  for (const quote of snapshot.quotes) {
    const location = "quotes[" + quote.id + "]";
    requirePositiveId(quote.id, location, issues);
    if (quoteIds.has(quote.id)) {
      error(issues, "DUPLICATE_QUOTE_ID", location, "Quote ID is duplicated.");
    }
    quoteIds.add(quote.id);
    requireText(quote.text, location + ".text", issues);
    requireText(quote.author, location + ".author", issues);
    if (containsMojibake(quote.text) || containsMojibake(quote.author)) {
      warning(
        issues,
        "SUSPECT_MOJIBAKE",
        location,
        "Text contains common UTF-8-as-Windows-1252 markers and requires owner review; it was not changed."
      );
    }
  }

  return {
    version: LEGACY_MIGRATION_VERSION,
    sourceChecksum: checksum(snapshot),
    counts: {
      projects: snapshot.projects.length,
      skillCategories: snapshot.skills.length,
      skills: skillCount,
      certificates: snapshot.certificates.length,
      quotes: snapshot.quotes.length,
    },
    projects,
    certificates,
    issues,
  };
}

export function assertMigrationReady(plan: MigrationPlan): void {
  const errors = plan.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      "Legacy migration preflight failed:\n" +
        errors
          .map(
            (issue) =>
              issue.code + " at " + issue.location + ": " + issue.message
          )
          .join("\n")
    );
  }
}

function normalizeProjectStatus(
  status: string,
  location: string,
  issues: MigrationIssue[]
): "COMPLETED" {
  if (status === "Completed") return "COMPLETED";
  error(
    issues,
    "UNKNOWN_PROJECT_STATUS",
    location,
    "Expected Completed, received " + JSON.stringify(status) + "."
  );
  return "COMPLETED";
}

function normalizeUrl(
  value: string | null,
  location: string,
  issues: MigrationIssue[]
): string | null {
  if (value === null) return null;
  if (value === "#") {
    warning(
      issues,
      "PLACEHOLDER_URL_REMOVED",
      location,
      "The legacy # placeholder becomes null."
    );
    return null;
  }
  const parsed = httpsUrlSchema.safeParse(value);
  if (!parsed.success) {
    error(issues, "INVALID_EXTERNAL_URL", location, parsed.error.message);
    return null;
  }
  return parsed.data;
}

function normalizeLegacyDate(
  value: string,
  location: string,
  issues: MigrationIssue[]
): string {
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value);
  if (match === null) {
    error(issues, "INVALID_CERTIFICATE_DATE", location, "Expected YYYY/MM/DD.");
    return value;
  }
  const normalized = [match[1], match[2], match[3]].join("-");
  if (Number.isNaN(Date.parse(normalized + "T00:00:00Z"))) {
    error(
      issues,
      "INVALID_CERTIFICATE_DATE",
      location,
      "Date is not a real calendar date."
    );
  }
  return normalized;
}

function normalizeCertificatePath(
  value: string,
  location: string,
  issues: MigrationIssue[]
): string {
  if (!/^\/Certificates\/[^/]+\.pdf$/.test(value)) {
    error(
      issues,
      "INVALID_CERTIFICATE_PATH",
      location,
      "Expected an absolute path below /Certificates/ ending in .pdf."
    );
  }
  return value;
}

function requirePositiveId(
  id: number,
  location: string,
  issues: MigrationIssue[]
): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    error(
      issues,
      "INVALID_LEGACY_ID",
      location,
      "ID must be a positive safe integer."
    );
  }
}

function requireText(
  value: string,
  location: string,
  issues: MigrationIssue[]
): void {
  if (typeof value !== "string" || value.normalize("NFC").trim().length === 0) {
    error(
      issues,
      "EMPTY_TEXT",
      location,
      "Value must contain non-whitespace text."
    );
  }
}

function validateHttps(
  value: string,
  location: string,
  issues: MigrationIssue[]
): void {
  const parsed = httpsUrlSchema.safeParse(value);
  if (!parsed.success) {
    error(issues, "INVALID_EXTERNAL_URL", location, parsed.error.message);
  }
}

function containsMojibake(value: string): boolean {
  return /(?:â€™|â€œ|â€|â€”|â€‘)/u.test(value);
}

function checksum(snapshot: LegacySnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function error(
  issues: MigrationIssue[],
  code: string,
  location: string,
  message: string
): void {
  issues.push({ severity: "error", code, location, message });
}

function warning(
  issues: MigrationIssue[],
  code: string,
  location: string,
  message: string
): void {
  issues.push({ severity: "warning", code, location, message });
}
