import { createHash } from "node:crypto";

import { hexColorSchema } from "@portfolio/contracts/common";
import {
  checkBadgeColorContrast,
  COLOR_CONTRAST_MINIMUM,
  type BadgeColorContrastReport,
} from "@portfolio/contracts/appearance";

/**
 * The reviewed replacement of the three black legacy skill colours (M2).
 *
 * This is a *separately versioned* migration for the same reason the
 * page-section and GitHub-statistics migrations are: the frozen legacy snapshot
 * in `apps/web/src/DataBase/Skills.json` is evidence, not configuration. It
 * still says `#000000`, it will keep saying `#000000`, and the applied
 * `2026-08-10.1` run that wrote those values stays in the ledger as proof of
 * what the source actually contained. The owner's accessibility decision is a
 * reviewed change layered on top, recorded under its own version, so the
 * reconciliation report can always answer "what did the source say" and "what
 * did we decide" separately.
 *
 * The replacements are held in code rather than read from a file because they
 * are a reviewed decision with an argument attached, and a decision that can be
 * edited without review is not reviewed.
 */
export const LEGACY_SKILL_COLOR_MIGRATION_VERSION = "2026-08-15.skill-colors.1";

/** The colour the preflight flags. Present so the guard reads as a rule. */
export const FLAGGED_LEGACY_SKILL_COLOR = "#000000";

export interface ReviewedSkillColorReplacement {
  readonly legacyId: number;
  /** Legacy skill name, carried for report legibility only. */
  readonly name: string;
  /** The exact source value this replacement is allowed to replace. */
  readonly from: string;
  readonly to: string;
  readonly rationale: string;
}

/**
 * All three brands are monochrome black, so none of them has a "real" colour to
 * fall back to. Each replacement keeps whatever brand association exists —
 * Next.js and Vercel both ship the same accent blue in their own documentation,
 * so the blue goes to Next.js and Vercel takes the purple from its brand
 * gradient; shadcn/ui's own default palette is zinc, so it takes a neutral.
 *
 * Every value below clears 4.5:1 against *both* theme backgrounds and for its
 * derived label. That is asserted at module load, not left to a test.
 */
export const REVIEWED_SKILL_COLOR_REPLACEMENTS: readonly ReviewedSkillColorReplacement[] =
  [
    {
      legacyId: 202,
      name: "Next.js (App Router)",
      from: FLAGGED_LEGACY_SKILL_COLOR,
      to: "#0070f3",
      rationale:
        "The accent blue Next.js uses throughout its own documentation; the brand mark itself is monochrome.",
    },
    {
      legacyId: 306,
      name: "shad CN",
      from: FLAGGED_LEGACY_SKILL_COLOR,
      to: "#767676",
      rationale:
        "A neutral from the zinc scale shadcn/ui ships as its own default palette.",
    },
    {
      legacyId: 801,
      name: "Vercel",
      from: FLAGGED_LEGACY_SKILL_COLOR,
      to: "#8b5cd6",
      rationale:
        "The purple of the Vercel brand gradient, taken because its blue is already carrying Next.js.",
    },
  ] as const;

export interface LegacySkillColorSnapshot {
  /** The frozen legacy skill categories, exactly as read from source. */
  readonly categories: readonly {
    readonly id: number;
    readonly items: readonly { readonly id: number; readonly color: string }[];
  }[];
}

export interface LegacySkillColorMigrationIssue {
  readonly code: string;
  readonly location: string;
  readonly message: string;
}

export interface PlannedSkillColorReplacement extends ReviewedSkillColorReplacement {
  readonly contrast: {
    readonly minimum: number;
    readonly labelColor: string;
    readonly labelContrast: number;
    readonly byTheme: readonly {
      readonly theme: string;
      readonly background: string;
      readonly fillContrast: number;
    }[];
  };
}

export interface LegacySkillColorMigrationPlan {
  readonly version: typeof LEGACY_SKILL_COLOR_MIGRATION_VERSION;
  readonly sourceChecksum: string;
  readonly replacements: readonly PlannedSkillColorReplacement[];
  /**
   * Legacy IDs that still hold the flagged colour in source and have no
   * reviewed replacement. Non-empty is a preflight failure, which is what stops
   * a fourth black skill from being migrated unnoticed later.
   */
  readonly unresolvedLegacyIds: readonly number[];
  readonly issues: readonly LegacySkillColorMigrationIssue[];
}

export interface LegacySkillColorMigrationTransaction {
  appliedChecksum(version: string): Promise<string | null>;
  setSkillColor(input: {
    readonly legacyId: number;
    readonly color: string;
  }): Promise<void>;
  recordAppliedMigration(input: {
    readonly version: string;
    readonly checksum: string;
    readonly report: unknown;
  }): Promise<void>;
}

export interface LegacySkillColorMigrationStore {
  transaction<T>(
    operation: (transaction: LegacySkillColorMigrationTransaction) => Promise<T>
  ): Promise<T>;
}

export interface AppliedLegacySkillColorMigration {
  readonly applied: boolean;
  readonly plan: LegacySkillColorMigrationPlan;
}

export function planLegacySkillColorMigration(
  snapshot: LegacySkillColorSnapshot,
  replacements: readonly ReviewedSkillColorReplacement[] = REVIEWED_SKILL_COLOR_REPLACEMENTS
): LegacySkillColorMigrationPlan {
  const issues: LegacySkillColorMigrationIssue[] = [];
  const sourceColors = new Map<number, string>();
  for (const category of snapshot.categories) {
    for (const skill of category.items) {
      sourceColors.set(skill.id, skill.color.toLowerCase());
    }
  }

  const seen = new Set<number>();
  const planned: PlannedSkillColorReplacement[] = [];
  for (const replacement of replacements) {
    const location = `replacements[${replacement.legacyId}]`;
    if (seen.has(replacement.legacyId)) {
      issue(
        issues,
        "DUPLICATE_REPLACEMENT",
        location,
        `Skill ${replacement.legacyId} has more than one reviewed replacement.`
      );
      continue;
    }
    seen.add(replacement.legacyId);

    const sourceColor = sourceColors.get(replacement.legacyId);
    if (sourceColor === undefined) {
      issue(
        issues,
        "UNKNOWN_SKILL",
        location,
        `Skill ${replacement.legacyId} does not exist in the frozen legacy source.`
      );
      continue;
    }

    // The guard that makes this migration safe to re-run against a changed
    // source: if the source colour is no longer what was reviewed, the review
    // no longer applies and the migration refuses rather than overwriting.
    if (sourceColor !== replacement.from.toLowerCase()) {
      issue(
        issues,
        "SOURCE_COLOR_CHANGED",
        `${location}.from`,
        `Skill ${replacement.legacyId} is ${sourceColor} in source, but the review replaces ${replacement.from}.`
      );
      continue;
    }

    const parsed = hexColorSchema.safeParse(replacement.to);
    if (!parsed.success) {
      issue(
        issues,
        "INVALID_REPLACEMENT_COLOR",
        `${location}.to`,
        parsed.error.issues.map((entry) => entry.message).join("; ")
      );
      continue;
    }

    const contrast = checkBadgeColorContrast(parsed.data);
    if (!contrast.passes) {
      issue(
        issues,
        "INACCESSIBLE_REPLACEMENT_COLOR",
        `${location}.to`,
        describeFailure(contrast)
      );
      continue;
    }

    planned.push({
      ...replacement,
      to: parsed.data,
      contrast: {
        minimum: contrast.minimum,
        labelColor: contrast.labelColor,
        labelContrast: round(contrast.labelContrast),
        byTheme: contrast.themes.map((theme) => ({
          theme: theme.theme,
          background: theme.background,
          fillContrast: round(theme.fillContrast),
        })),
      },
    });
  }

  const unresolvedLegacyIds = [...sourceColors.entries()]
    .filter(
      ([legacyId, color]) =>
        color === FLAGGED_LEGACY_SKILL_COLOR && !seen.has(legacyId)
    )
    .map(([legacyId]) => legacyId)
    .sort((first, second) => first - second);
  for (const legacyId of unresolvedLegacyIds) {
    issue(
      issues,
      "UNRESOLVED_SKILL_COLOR",
      `skills[${legacyId}].color`,
      `Skill ${legacyId} is ${FLAGGED_LEGACY_SKILL_COLOR} in source and has no reviewed replacement.`
    );
  }

  return {
    version: LEGACY_SKILL_COLOR_MIGRATION_VERSION,
    // The checksum covers the source colours *and* the reviewed decision, so
    // re-running after a colour is re-picked is a different version-checksum
    // pair rather than a silent no-op against the ledger.
    sourceChecksum: createHash("sha256")
      .update(
        JSON.stringify({
          source: [...sourceColors.entries()].sort(
            ([first], [second]) => first - second
          ),
          replacements: replacements.map((replacement) => [
            replacement.legacyId,
            replacement.from.toLowerCase(),
            replacement.to.toLowerCase(),
          ]),
        })
      )
      .digest("hex"),
    replacements: planned,
    unresolvedLegacyIds,
    issues,
  };
}

export function assertLegacySkillColorMigrationReady(
  plan: LegacySkillColorMigrationPlan
): void {
  if (plan.issues.length === 0) return;
  throw new Error(
    "Legacy skill-colour migration preflight failed:\n" +
      plan.issues
        .map((entry) => `${entry.code} at ${entry.location}: ${entry.message}`)
        .join("\n")
  );
}

export async function applyLegacySkillColorMigration(
  store: LegacySkillColorMigrationStore,
  snapshot: LegacySkillColorSnapshot,
  replacements: readonly ReviewedSkillColorReplacement[] = REVIEWED_SKILL_COLOR_REPLACEMENTS
): Promise<AppliedLegacySkillColorMigration> {
  const plan = planLegacySkillColorMigration(snapshot, replacements);
  assertLegacySkillColorMigrationReady(plan);

  return store.transaction(async (transaction) => {
    const previous = await transaction.appliedChecksum(plan.version);
    if (previous === plan.sourceChecksum) return { applied: false, plan };
    if (previous !== null) {
      throw new Error(
        `Migration version ${plan.version} was applied with a different source checksum.`
      );
    }

    for (const replacement of plan.replacements) {
      await transaction.setSkillColor({
        legacyId: replacement.legacyId,
        color: replacement.to,
      });
    }
    await transaction.recordAppliedMigration({
      version: plan.version,
      checksum: plan.sourceChecksum,
      report: serializeSkillColorPlan(plan),
    });
    return { applied: true, plan };
  });
}

/** The exact shape written to the ledger and to the evidence file. */
export function serializeSkillColorPlan(
  plan: LegacySkillColorMigrationPlan
): Record<string, unknown> {
  return {
    migrationVersion: plan.version,
    sourceChecksum: plan.sourceChecksum,
    contrastMinimum: COLOR_CONTRAST_MINIMUM,
    replacements: plan.replacements,
    unresolvedLegacyIds: plan.unresolvedLegacyIds,
    errors: plan.issues,
  };
}

function describeFailure(contrast: BadgeColorContrastReport): string {
  const parts = contrast.themes
    .filter((theme) => !theme.passes)
    .map(
      (theme) =>
        `${theme.theme} background ${theme.background} at ${round(theme.fillContrast)}:1`
    );
  if (contrast.labelContrast < contrast.minimum) {
    parts.push(
      `derived label ${contrast.labelColor} at ${round(contrast.labelContrast)}:1`
    );
  }
  return `${contrast.color} needs ${contrast.minimum}:1 but measures ${parts.join(", ")}.`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function issue(
  issues: LegacySkillColorMigrationIssue[],
  code: string,
  location: string,
  message: string
): void {
  issues.push({ code, location, message });
}

// A reviewed replacement that does not itself pass is a contradiction, and it
// should fail at import rather than at apply time in front of a database.
for (const replacement of REVIEWED_SKILL_COLOR_REPLACEMENTS) {
  const contrast = checkBadgeColorContrast(replacement.to);
  if (!contrast.passes) {
    throw new Error(
      `Reviewed replacement for skill ${replacement.legacyId} is inaccessible: ${describeFailure(contrast)}`
    );
  }
}
