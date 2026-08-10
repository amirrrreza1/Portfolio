/**
 * Deterministic seed.
 *
 * "Deterministic" is the requirement, not a nice-to-have: M1's exit gate is
 * that a clean database migrates from zero and seeds *deterministically*, and
 * M2's reconciliation compares migrated output against known values. A seed
 * that generated random IDs or used `new Date()` would make every run produce a
 * different database, and nothing downstream could assert anything about it.
 *
 * Three rules follow from that:
 *
 *   1. Every ID is a fixed literal, never generated.
 *   2. Every timestamp that is part of the seeded data is a fixed instant.
 *      `createdAt`/`updatedAt` are left to the database, since they are
 *      metadata rather than content.
 *   3. Every write is an upsert keyed on a stable natural key, so re-running
 *      changes nothing.
 *
 * This seeds only the structural rows the application needs to boot: the two
 * settings singletons, the page sections, navigation, and social links. It
 * deliberately does NOT seed portfolio content — projects, skills,
 * certificates, and quotes arrive through the M2 migration from the legacy
 * JSON, and seeding them here would create two competing sources for the same
 * rows and make the reconciliation meaningless.
 */

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/client/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** Fixed literals. Changing one is a data migration, not an edit. */
const IDS = {
  heroSection: "herosection0000000000000",
  aboutSection: "aboutsection000000000000",
  skillsSection: "skillssection00000000000",
  projectsSection: "projectssection000000000",
  certificatesSection: "certificatessection00000",
  contactSection: "contactsection0000000000",
  navHome: "navhome00000000000000000",
  navAbout: "navabout0000000000000000",
  navSkills: "navskills000000000000000",
  navProjects: "navprojects0000000000000",
  navCertificates: "navcertificates000000000",
  navContact: "navcontact00000000000000",
  socialGithub: "socialgithub000000000000",
  socialLinkedin: "sociallinkedin0000000000",
  socialTelegram: "socialtelegram0000000000",
  socialDonate: "socialdonate000000000000",
} as const;

async function seedSiteSettings(): Promise<void> {
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      // Overwritten per environment. The CHECK constraint permits
      // http://localhost specifically so a local seed is not forced to invent
      // an https origin it does not have.
      canonicalSiteUrl: "http://localhost:3000",
      defaultLocale: "en",
      enabledLocales: ["en", "fa"],
      timezone: "Asia/Tehran",
      authorName: "Amirreza Azarioun",
      creatorName: "Amirreza Azarioun",
      publisherName: "Amirreza Azarioun",
      contactRecipientEmail: "owner@example.invalid",
      contactEnabled: true,
      contactRetentionDays: 90,
      githubUsername: "amirrrreza1",
      githubRepoAllowlist: [],
      githubCacheTtlSeconds: 3600,
      robotsAllowIndexing: false,
    },
  });

  const translations = [
    {
      locale: "en" as const,
      siteName: "Amirreza Azarioun",
      titleTemplate: "%s | Amirreza Azarioun",
      metaDescription: "Amirreza Azarioun's portfolio site",
    },
    {
      locale: "fa" as const,
      siteName: "امیررضا آذریون",
      titleTemplate: "%s | امیررضا آذریون",
      metaDescription: "وب‌سایت شخصی امیررضا آذریون",
    },
  ];

  for (const translation of translations) {
    await prisma.siteSettingsTranslation.upsert({
      where: {
        siteSettingsId_locale: {
          siteSettingsId: 1,
          locale: translation.locale,
        },
      },
      update: {},
      create: { siteSettingsId: 1, ...translation },
    });
  }
}

async function seedAppearanceSettings(): Promise<void> {
  // These keys must exist in the code registry in @portfolio/contracts. They
  // are not imported from it, because this package must not depend on the
  // browser-facing contracts package; the constraint is that they agree, and
  // the appearance contract test is what proves it.
  await prisma.appearanceSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      enabledThemes: ["dark", "light"],
      defaultTheme: "dark",
      enabledBlogFonts: ["jetbrains-mono", "vazir-code", "system-sans"],
      // Persian must default to a font that can render Persian. jetbrains-mono
      // is Latin-only, so using it here would render Persian articles as boxes.
      defaultBlogFontByLocale: { en: "jetbrains-mono", fa: "vazir-code" },
      allowedBlogSizeSteps: ["sm", "md", "lg", "xl"],
      defaultBlogSizeStep: "md",
      offerMotionToggle: true,
    },
  });
}

async function seedPageSections(): Promise<void> {
  const sections = [
    {
      id: IDS.heroSection,
      key: "hero",
      sortOrder: 0,
      content: { variant: "primary" },
      translations: [
        {
          locale: "en" as const,
          title: "Amirreza Azarioun",
          content: { lines: ["Frontend Developer"] },
        },
        {
          locale: "fa" as const,
          title: "امیررضا آذریون",
          content: { lines: ["توسعه‌دهنده فرانت‌اند"] },
        },
      ],
    },
    {
      id: IDS.aboutSection,
      key: "about",
      sortOrder: 1,
      // The legacy About Me prose is migrated in M2 from the hard-coded
      // component, not invented here. Seeding placeholder prose would put text
      // in the database that the reconciliation would then have to explain.
      content: { location: "Tehran, Iran", role: "frontend developer" },
      translations: [
        { locale: "en" as const, title: "About Me", content: { body: [] } },
        { locale: "fa" as const, title: "درباره من", content: { body: [] } },
      ],
    },
    {
      id: IDS.skillsSection,
      key: "skills",
      sortOrder: 2,
      content: {},
      translations: [
        { locale: "en" as const, title: "Skills", content: {} },
        { locale: "fa" as const, title: "مهارت‌ها", content: {} },
      ],
    },
    {
      id: IDS.projectsSection,
      key: "projects",
      sortOrder: 3,
      content: {},
      translations: [
        { locale: "en" as const, title: "Projects", content: {} },
        { locale: "fa" as const, title: "پروژه‌ها", content: {} },
      ],
    },
    {
      id: IDS.certificatesSection,
      key: "certificates",
      sortOrder: 4,
      content: {},
      translations: [
        { locale: "en" as const, title: "Certificates", content: {} },
        { locale: "fa" as const, title: "گواهینامه‌ها", content: {} },
      ],
    },
    {
      id: IDS.contactSection,
      key: "contact",
      sortOrder: 5,
      content: {},
      translations: [
        { locale: "en" as const, title: "Get in Touch", content: {} },
        { locale: "fa" as const, title: "تماس با من", content: {} },
      ],
    },
  ];

  for (const section of sections) {
    const { translations, ...record } = section;

    await prisma.pageSection.upsert({
      where: { key: record.key },
      update: {},
      create: record,
    });

    for (const translation of translations) {
      await prisma.pageSectionTranslation.upsert({
        where: {
          sectionId_locale: {
            sectionId: record.id,
            locale: translation.locale,
          },
        },
        update: {},
        create: { sectionId: record.id, ...translation },
      });
    }
  }
}

async function seedNavigation(): Promise<void> {
  // The six items currently hard-coded in the header. Every target is a
  // section anchor or a site-relative path; an external URL is rejected by the
  // CHECK constraint, because a header that can point off-site is a redirect
  // surface.
  const items = [
    {
      id: IDS.navHome,
      key: "hero",
      en: "Home",
      fa: "خانه",
      kind: "SECTION_ANCHOR" as const,
      target: "hero",
    },
    {
      id: IDS.navAbout,
      key: "about",
      en: "About",
      fa: "درباره",
      kind: "SECTION_ANCHOR" as const,
      target: "about",
    },
    {
      id: IDS.navSkills,
      key: "skills",
      en: "Skills",
      fa: "مهارت‌ها",
      kind: "SECTION_ANCHOR" as const,
      target: "skills",
    },
    {
      id: IDS.navProjects,
      key: "projects",
      en: "Projects",
      fa: "پروژه‌ها",
      kind: "INTERNAL_ROUTE" as const,
      target: "/projects",
    },
    {
      id: IDS.navCertificates,
      key: "certificates",
      en: "Certificates",
      fa: "گواهینامه‌ها",
      kind: "SECTION_ANCHOR" as const,
      target: "certificates",
    },
    {
      id: IDS.navContact,
      key: "contact",
      en: "Contact",
      fa: "تماس",
      kind: "SECTION_ANCHOR" as const,
      target: "contact",
    },
  ];

  for (const [index, item] of items.entries()) {
    await prisma.navItem.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        labelByLocale: { en: item.en, fa: item.fa },
        targetKind: item.kind,
        target: item.target,
        sortOrder: index,
        enabled: true,
      },
    });
  }
}

async function seedSocialLinks(): Promise<void> {
  const links = [
    {
      id: IDS.socialGithub,
      en: "GitHub",
      fa: "گیت‌هاب",
      url: "https://github.com/amirrrreza1",
      kind: "SOCIAL" as const,
    },
    {
      id: IDS.socialLinkedin,
      en: "LinkedIn",
      fa: "لینکدین",
      url: "https://www.linkedin.com/in/amirreza-azarioun",
      kind: "SOCIAL" as const,
    },
    {
      id: IDS.socialTelegram,
      en: "Telegram",
      fa: "تلگرام",
      url: "https://t.me/amirrrreza1",
      kind: "SOCIAL" as const,
    },
    {
      id: IDS.socialDonate,
      en: "Donate",
      fa: "حمایت",
      url: "https://daramet.com/amirrrreza1",
      kind: "DONATE" as const,
    },
  ];

  for (const [index, link] of links.entries()) {
    await prisma.socialLink.upsert({
      where: { id: link.id },
      update: {},
      create: {
        id: link.id,
        labelByLocale: { en: link.en, fa: link.fa },
        url: link.url,
        kind: link.kind,
        sortOrder: index,
        enabled: true,
      },
    });
  }
}

async function main(): Promise<void> {
  // One transaction is not used here deliberately: each upsert is independently
  // idempotent, and a partial failure should leave the successful rows in place
  // so a re-run completes the remainder rather than starting over.
  await seedSiteSettings();
  await seedAppearanceSettings();
  await seedPageSections();
  await seedNavigation();
  await seedSocialLinks();

  const counts = {
    siteSettings: await prisma.siteSettings.count(),
    appearanceSettings: await prisma.appearanceSettings.count(),
    pageSections: await prisma.pageSection.count(),
    pageSectionTranslations: await prisma.pageSectionTranslation.count(),
    navItems: await prisma.navItem.count(),
    socialLinks: await prisma.socialLink.count(),
  };

  console.log("Seed complete:", counts);

  const expected = {
    siteSettings: 1,
    appearanceSettings: 1,
    pageSections: 6,
    pageSectionTranslations: 12,
    navItems: 6,
    socialLinks: 4,
  };

  // A seed that silently produced the wrong number of rows would be discovered
  // by the M2 reconciliation instead, which is far too late.
  for (const [key, value] of Object.entries(expected)) {
    const actual = counts[key as keyof typeof counts];
    if (actual !== value) {
      throw new Error(`Seed produced ${actual} ${key}, expected ${value}.`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
