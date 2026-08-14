import {
  publicSiteEnvelopeSchema,
  publicSiteSchema,
} from "../src/portfolio/public-site.js";
import { describe, expect, it } from "vitest";

const fixture = {
  locale: "fa",
  settings: {
    canonicalSiteUrl: "http://localhost:3000",
    defaultLocale: "en",
    enabledLocales: ["en", "fa"],
    siteName: "امیررضا آذریون",
    titleTemplate: "%s | امیررضا آذریون",
    metaDescription: "وب‌سایت شخصی امیررضا آذریون",
    authorName: "Amirreza Azarioun",
    creatorName: "Amirreza Azarioun",
    publisherName: "Amirreza Azarioun",
    contactEnabled: true,
    githubUsername: "amirrrreza1",
    githubRepoAllowlist: ["Portfolio", "Morse-Code"],
    githubCacheTtlSeconds: 3_600,
    robotsAllowIndexing: false,
  },
  sections: [
    {
      key: "hero",
      title: "امیررضا آذریون",
      content: { variant: "primary", lines: ["توسعه‌دهنده فرانت‌اند"] },
    },
    {
      key: "about",
      title: "درباره من",
      content: {
        location: "Tehran, Iran",
        role: "frontend developer",
        body: [],
      },
    },
    { key: "skills", title: "مهارت‌ها", content: {} },
  ],
  navigation: [
    {
      id: "navhome00000000000000000",
      label: "خانه",
      iconKey: null,
      targetKind: "SECTION_ANCHOR",
      target: "hero",
    },
    {
      id: "navprojects0000000000000",
      label: "پروژه‌ها",
      iconKey: null,
      targetKind: "INTERNAL_ROUTE",
      target: "/projects",
    },
  ],
  socialLinks: [
    {
      id: "socialgithub000000000000",
      label: "گیت‌هاب",
      iconKey: null,
      rel: null,
      kind: "SOCIAL",
      url: "https://github.com/amirrrreza1",
    },
  ],
} as const;

describe("public site DTO", () => {
  it("accepts the strict localized public shape", () => {
    expect(publicSiteSchema.parse(fixture)).toEqual(fixture);
    expect(
      publicSiteEnvelopeSchema.safeParse({
        data: fixture,
        meta: { requestId: "request-fa" },
      }).success
    ).toBe(true);
  });

  it.each([
    ["settings", { ...fixture.settings, contactRecipientEmail: "secret@test" }],
    ["sections", [{ ...fixture.sections[0], version: 4 }]],
    ["navigation", [{ ...fixture.navigation[0], enabled: true }]],
    ["socialLinks", [{ ...fixture.socialLinks[0], storageKey: "private" }]],
  ] as const)("rejects internal fields in %s", (key, value) => {
    expect(
      publicSiteSchema.safeParse({ ...fixture, [key]: value }).success
    ).toBe(false);
  });

  it("rejects unknown section keys and unvalidated payload fields", () => {
    expect(
      publicSiteSchema.safeParse({
        ...fixture,
        sections: [{ key: "custom", title: "Custom", content: {} }],
      }).success
    ).toBe(false);
    expect(
      publicSiteSchema.safeParse({
        ...fixture,
        sections: [
          {
            ...fixture.sections[0],
            content: { ...fixture.sections[0].content, script: "alert(1)" },
          },
        ],
      }).success
    ).toBe(false);
  });

  it("rejects off-site navigation and unsafe social protocols", () => {
    expect(
      publicSiteSchema.safeParse({
        ...fixture,
        navigation: [
          { ...fixture.navigation[1], target: "//attacker.example" },
        ],
      }).success
    ).toBe(false);
    expect(
      publicSiteSchema.safeParse({
        ...fixture,
        socialLinks: [
          { ...fixture.socialLinks[0], url: "http://attacker.example" },
        ],
      }).success
    ).toBe(false);
  });

  it("requires the default locale to remain enabled", () => {
    expect(
      publicSiteSchema.safeParse({
        ...fixture,
        settings: { ...fixture.settings, enabledLocales: ["fa"] },
      }).success
    ).toBe(false);
  });

  it("rejects unsafe, duplicate, or ownerless GitHub allowlists", () => {
    for (const settings of [
      { ...fixture.settings, githubRepoAllowlist: ["owner/repository"] },
      {
        ...fixture.settings,
        githubRepoAllowlist: ["Portfolio", "portfolio"],
      },
      {
        ...fixture.settings,
        githubUsername: null,
        githubRepoAllowlist: ["Portfolio"],
      },
    ]) {
      expect(publicSiteSchema.safeParse({ ...fixture, settings }).success).toBe(
        false
      );
    }
  });
});
