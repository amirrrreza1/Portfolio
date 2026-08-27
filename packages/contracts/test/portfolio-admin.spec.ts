import { describe, expect, it } from "vitest";

import {
  adminAppearanceUpdateSchema,
  adminNavItemCreateSchema,
  adminProjectSchema,
  adminSkillSchema,
  adminSiteSettingsSchema,
  adminSocialLinkCreateSchema,
} from "../src/portfolio/admin.js";

describe("portfolio admin contracts", () => {
  it("keeps the default locale enabled and rejects a repository allowlist without its owner", () => {
    const base = {
      canonicalSiteUrl: "https://portfolio.example",
      defaultLocale: "en",
      enabledLocales: ["en"],
      timezone: "Asia/Tehran",
      defaultSocialImageId: null,
      authorName: "Owner",
      creatorName: "Owner",
      publisherName: "Owner",
      contactRecipientEmail: "owner@example.test",
      contactEnabled: true,
      contactRetentionDays: 90,
      githubUsername: null,
      githubRepoAllowlist: [],
      githubCacheTtlSeconds: 3600,
      robotsAllowIndexing: true,
      birthDate: null,
    };

    expect(adminSiteSettingsSchema.safeParse(base).success).toBe(true);
    expect(
      adminSiteSettingsSchema.safeParse({ ...base, defaultLocale: "fa" }).success
    ).toBe(false);
    expect(
      adminSiteSettingsSchema.safeParse({ ...base, githubRepoAllowlist: ["portfolio"] }).success
    ).toBe(false);
  });

  it("permits only registry-backed appearance settings", () => {
    expect(
      adminAppearanceUpdateSchema.safeParse({
        settings: {
          enabledThemes: ["dark", "light"],
          defaultTheme: "dark",
          enabledBlogFonts: ["jetbrains-mono", "vazir-code"],
          defaultBlogFontByLocale: { en: "jetbrains-mono", fa: "vazir-code" },
          allowedBlogSizeSteps: ["sm", "md"],
          defaultBlogSizeStep: "md",
          offerMotionToggle: true,
        },
      }).success
    ).toBe(true);
  });

  it("does not allow navigation to leave the site or social links to use arbitrary protocols", () => {
    expect(
      adminNavItemCreateSchema.safeParse({
        labelByLocale: { en: "Blog" },
        targetKind: "INTERNAL_ROUTE",
        target: "//attacker.example",
        iconKey: null,
        enabled: true,
        sortOrder: 1,
      }).success
    ).toBe(false);
    expect(
      adminSocialLinkCreateSchema.safeParse({
        labelByLocale: { en: "Bad" },
        kind: "SOCIAL",
        url: "javascript:alert(1)",
        iconKey: null,
        rel: "noopener",
        enabled: true,
        sortOrder: 1,
      }).success
    ).toBe(false);
  });

  it("requires canonical project relationships and a valid skill colour", () => {
    expect(
      adminSkillSchema.safeParse({ categoryId: "category", name: "TypeScript", color: "#0070f3", iconMediaId: null, enabled: true, sortOrder: 1 }).success
    ).toBe(true);
    expect(
      adminProjectSchema.safeParse({ slug: "portfolio", status: "COMPLETED", demoUrl: null, repositoryUrl: null, imageId: null, featured: false, enabled: true, sortOrder: 0, startedAt: null, completedAt: null, skills: [{ skillId: "skill", sortOrder: 0 }, { skillId: "skill", sortOrder: 1 }] }).success
    ).toBe(false);
  });
});
