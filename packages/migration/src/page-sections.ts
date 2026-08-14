import { createHash } from "node:crypto";

import { isoDateSchema } from "@portfolio/contracts/common";
import { publicPageSectionSchema } from "@portfolio/contracts/portfolio";

export const LEGACY_PAGE_SECTION_MIGRATION_VERSION =
  "2026-08-14.page-sections.1";

const SECTION_KEYS = [
  "hero",
  "about",
  "skills",
  "contact",
  "projects",
  "certificates",
] as const;

export type LegacyPageSectionKey = (typeof SECTION_KEYS)[number];

export interface LegacyPageSectionTranslation {
  readonly title: string;
  readonly content: Readonly<Record<string, unknown>>;
}

export interface LegacyPageSectionInput {
  readonly key: LegacyPageSectionKey;
  readonly sortOrder: number;
  readonly content?: Readonly<Record<string, unknown>>;
  readonly english?: LegacyPageSectionTranslation;
}

export interface LegacyPageSectionSnapshot {
  /** Private source value. It participates in the checksum but never the report. */
  readonly birthDate: string | null;
  readonly sections: readonly LegacyPageSectionInput[];
}

export interface LegacyPageSectionMigrationIssue {
  readonly code: string;
  readonly location: string;
  readonly message: string;
}

export interface LegacyPageSectionMigrationPlan {
  readonly version: typeof LEGACY_PAGE_SECTION_MIGRATION_VERSION;
  readonly sourceChecksum: string;
  readonly birthDateConfigured: boolean;
  readonly sectionKeys: readonly LegacyPageSectionKey[];
  readonly issues: readonly LegacyPageSectionMigrationIssue[];
}

export interface LegacyPageSectionMigrationTransaction {
  appliedChecksum(version: string): Promise<string | null>;
  setSiteBirthDate(value: string | null): Promise<void>;
  applySection(input: LegacyPageSectionInput): Promise<void>;
  recordAppliedMigration(input: {
    readonly version: string;
    readonly checksum: string;
    readonly report: unknown;
  }): Promise<void>;
}

export interface LegacyPageSectionMigrationStore {
  transaction<T>(
    operation: (
      transaction: LegacyPageSectionMigrationTransaction
    ) => Promise<T>
  ): Promise<T>;
}

export interface AppliedLegacyPageSectionMigration {
  readonly applied: boolean;
  readonly plan: LegacyPageSectionMigrationPlan;
}

export function planLegacyPageSectionMigration(
  snapshot: LegacyPageSectionSnapshot
): LegacyPageSectionMigrationPlan {
  const issues: LegacyPageSectionMigrationIssue[] = [];
  const seen = new Set<string>();

  if (
    snapshot.birthDate !== null &&
    !isoDateSchema.safeParse(snapshot.birthDate).success
  ) {
    issue(
      issues,
      "INVALID_BIRTH_DATE",
      "birthDate",
      "Birth date must be null or a real ISO calendar date."
    );
  }

  for (const [index, section] of snapshot.sections.entries()) {
    const location = `sections[${index}]`;
    if (!SECTION_KEYS.includes(section.key)) {
      issue(
        issues,
        "UNKNOWN_SECTION_KEY",
        `${location}.key`,
        "Section key is not in the public render allowlist."
      );
      continue;
    }
    if (seen.has(section.key)) {
      issue(
        issues,
        "DUPLICATE_SECTION_KEY",
        `${location}.key`,
        `Section ${section.key} is duplicated.`
      );
    }
    seen.add(section.key);
    if (
      !Number.isSafeInteger(section.sortOrder) ||
      section.sortOrder < 0 ||
      section.sortOrder > 10_000
    ) {
      issue(
        issues,
        "INVALID_SORT_ORDER",
        `${location}.sortOrder`,
        "Sort order must be an integer from 0 through 10000."
      );
    }

    if (section.key === "hero" || section.key === "about") {
      validateEditableSection(section, location, issues);
    } else if (section.content !== undefined || section.english !== undefined) {
      issue(
        issues,
        "UNEXPECTED_SECTION_CONTENT",
        location,
        `Section ${section.key} migration may only change its order.`
      );
    }
  }

  for (const key of SECTION_KEYS) {
    if (!seen.has(key)) {
      issue(
        issues,
        "MISSING_SECTION_KEY",
        "sections",
        `Section ${key} is missing from the render plan.`
      );
    }
  }

  return {
    version: LEGACY_PAGE_SECTION_MIGRATION_VERSION,
    sourceChecksum: createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex"),
    birthDateConfigured: snapshot.birthDate !== null,
    sectionKeys: snapshot.sections.map((section) => section.key),
    issues,
  };
}

export function assertLegacyPageSectionMigrationReady(
  plan: LegacyPageSectionMigrationPlan
): void {
  if (plan.issues.length === 0) return;
  throw new Error(
    "Legacy page-section migration preflight failed:\n" +
      plan.issues
        .map(
          (migrationIssue) =>
            `${migrationIssue.code} at ${migrationIssue.location}: ${migrationIssue.message}`
        )
        .join("\n")
  );
}

export async function applyLegacyPageSectionMigration(
  store: LegacyPageSectionMigrationStore,
  snapshot: LegacyPageSectionSnapshot
): Promise<AppliedLegacyPageSectionMigration> {
  const plan = planLegacyPageSectionMigration(snapshot);
  assertLegacyPageSectionMigrationReady(plan);

  return store.transaction(async (transaction) => {
    const previous = await transaction.appliedChecksum(plan.version);
    if (previous === plan.sourceChecksum) return { applied: false, plan };
    if (previous !== null) {
      throw new Error(
        `Migration version ${plan.version} was applied with a different source checksum.`
      );
    }

    await transaction.setSiteBirthDate(snapshot.birthDate);
    for (const section of snapshot.sections) {
      await transaction.applySection(section);
    }
    await transaction.recordAppliedMigration({
      version: plan.version,
      checksum: plan.sourceChecksum,
      report: {
        migrationVersion: plan.version,
        sourceChecksum: plan.sourceChecksum,
        birthDateConfigured: plan.birthDateConfigured,
        sectionKeys: plan.sectionKeys,
        errors: plan.issues,
      },
    });
    return { applied: true, plan };
  });
}

function validateEditableSection(
  section: LegacyPageSectionInput,
  location: string,
  issues: LegacyPageSectionMigrationIssue[]
): void {
  if (section.content === undefined || section.english === undefined) {
    issue(
      issues,
      "MISSING_SECTION_CONTENT",
      location,
      `Section ${section.key} requires base and English content.`
    );
    return;
  }

  const candidate = {
    key: section.key,
    title: section.english.title,
    content: { ...section.content, ...section.english.content },
  };
  const parsed = publicPageSectionSchema.safeParse(candidate);
  if (!parsed.success) {
    issue(
      issues,
      "INVALID_SECTION_CONTENT",
      location,
      parsed.error.issues
        .map((validationIssue) => validationIssue.message)
        .join("; ")
    );
    return;
  }

  const markdownValues =
    parsed.data.key === "hero"
      ? [parsed.data.content.subtitle].filter(
          (value): value is string => value !== undefined
        )
      : parsed.data.key === "about"
        ? parsed.data.content.body
        : [];
  for (const [index, markdown] of markdownValues.entries()) {
    const tokens = [...markdown.matchAll(/\{\{([^}]+)\}\}/g)].map(
      (match) => match[1]
    );
    if (tokens.some((token) => token !== "age")) {
      issue(
        issues,
        "UNKNOWN_TEMPLATE_TOKEN",
        `${location}.english.content[${index}]`,
        "Only the {{age}} template token is permitted."
      );
    }
  }
}

function issue(
  issues: LegacyPageSectionMigrationIssue[],
  code: string,
  location: string,
  message: string
): void {
  issues.push({ code, location, message });
}
