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
 * This seeds the structural rows the application needs to boot and one
 * explicitly labelled bilingual test article. It deliberately does NOT seed
 * portfolio content — projects, skills, certificates, and quotes arrive
 * through the M2 migration from the legacy JSON, and seeding them here would
 * create two competing sources for the same rows and make the reconciliation
 * meaningless.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CURRENT_FRONTMATTER_VERSION } from "@portfolio/contracts/content";
import { renderArticleBody } from "@portfolio/markdown";

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
  testBlogPost: "testblogpost000000000000",
  testBlogEnglish: "testblogen00000000000000",
  testBlogPersian: "testblogfa00000000000000",
} as const;

const TEST_BLOG_PUBLISHED_AT = new Date("2026-09-09T09:00:00.000Z");

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
      enabledLocales: ["en"],
      timezone: "Asia/Tehran",
      authorName: "Amirreza Azarioun",
      creatorName: "Amirreza Azarioun",
      publisherName: "Amirreza Azarioun",
      contactRecipientEmail: "owner@example.invalid",
      contactEnabled: true,
      contactRetentionDays: 90,
      auditRetentionDays: 400,
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
      keywords: [
        "Amirreza Azarioun",
        "Portfolio",
        "Web Developer",
        "Frontend",
        "React",
        "Next.js",
        "JavaScript",
        "TypeScript",
      ],
      footerLines: [],
      footerRights: "All rights reserved",
      resumeButtonLabel: "Download Resume",
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
      ],
    },
    {
      id: IDS.aboutSection,
      key: "about",
      sortOrder: 1,
      // The legacy About Me prose is migrated in M2 from the hard-coded
      // component, not invented here. Seeding placeholder prose would put text
      // in the database that the reconciliation would then have to explain.
      //
      // `location` and `role` are NOT prose and they are not optional: the
      // public section DTO requires both, so a database that is migrated and
      // seeded but has not yet had the M2 migration applied would otherwise
      // fail validation and take the whole `/site` endpoint down with it.
      // They live in the English translation because that is where
      // PageSections.json puts them and where the API reads them.
      content: {},
      translations: [
        {
          locale: "en" as const,
          title: "About Me",
          content: {
            location: "Tehran, Iran",
            role: "frontend developer",
            body: [],
          },
        },
      ],
    },
    {
      id: IDS.skillsSection,
      key: "skills",
      sortOrder: 2,
      content: {},
      translations: [{ locale: "en" as const, title: "Skills", content: {} }],
    },
    {
      id: IDS.projectsSection,
      key: "projects",
      sortOrder: 3,
      content: {},
      translations: [{ locale: "en" as const, title: "Projects", content: {} }],
    },
    {
      id: IDS.certificatesSection,
      key: "certificates",
      sortOrder: 4,
      content: {},
      translations: [
        { locale: "en" as const, title: "Certificates", content: {} },
      ],
    },
    {
      id: IDS.contactSection,
      key: "contact",
      sortOrder: 5,
      content: {},
      translations: [
        {
          locale: "en" as const,
          title: "Get in Touch",
          content: {
            nameLabel: "Name",
            namePlaceholder: "Your name",
            emailLabel: "Email",
            emailPlaceholder: "you@example.com",
            messageLabel: "Message",
            messagePlaceholder: "Write your message…",
            sendingLabel: "Sending…",
            submitLabel: "Send message",
            successMessage: "Thanks — your message has been received.",
            failureMessage:
              "Something went wrong. Please try again in a moment.",
            invalidNameMessage: "Enter a valid name.",
            invalidEmailMessage: "Enter a valid email address.",
            invalidMessageMessage:
              "Enter a message between 10 and 5,000 characters.",
          },
        },
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
      kind: "SECTION_ANCHOR" as const,
      target: "hero",
    },
    {
      id: IDS.navAbout,
      key: "about",
      en: "About",
      kind: "SECTION_ANCHOR" as const,
      target: "about",
    },
    {
      id: IDS.navSkills,
      key: "skills",
      en: "Skills",
      kind: "SECTION_ANCHOR" as const,
      target: "skills",
    },
    {
      id: IDS.navProjects,
      key: "projects",
      en: "Projects",
      kind: "INTERNAL_ROUTE" as const,
      target: "/projects",
    },
    {
      id: IDS.navCertificates,
      key: "certificates",
      en: "Certificates",
      kind: "SECTION_ANCHOR" as const,
      target: "certificates",
    },
    {
      id: IDS.navContact,
      key: "contact",
      en: "Contact",
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
        labelByLocale: { en: item.en },
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
      url: "https://github.com/amirrrreza1",
      kind: "SOCIAL" as const,
    },
    {
      id: IDS.socialLinkedin,
      en: "LinkedIn",
      url: "https://www.linkedin.com/in/amirreza-azarioun",
      kind: "SOCIAL" as const,
    },
    {
      id: IDS.socialTelegram,
      en: "Telegram",
      url: "https://t.me/amirrrreza1",
      kind: "SOCIAL" as const,
    },
    {
      id: IDS.socialDonate,
      en: "Donate",
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
        labelByLocale: { en: link.en },
        url: link.url,
        kind: link.kind,
        sortOrder: index,
        enabled: true,
      },
    });
  }
}

/**
 * A durable typography/content fixture for manual testing.
 *
 * The two translations share one Post identity so language alternates behave
 * exactly like a real bilingual article. The Markdown files are authoritative
 * seed input; rendering and hashing happen through the production pipeline so
 * public reads do not need a special test-only exception.
 */
async function seedTestBlog(): Promise<void> {
  const translations = [
    {
      id: IDS.testBlogEnglish,
      locale: "en" as const,
      title: "Building a Bilingual Portfolio That Stays Maintainable",
      slug: "building-a-maintainable-bilingual-portfolio",
      excerpt:
        "A practical, long-form test article covering architecture, typography, content workflows, performance, and verification for a bilingual portfolio.",
      seoTitle: "Building a Maintainable Bilingual Portfolio",
      seoDescription:
        "A practical guide to architecture, typography, content workflows, performance, and testing for an English and Persian portfolio.",
      fixture: new URL("./fixtures/test-blog.en.md", import.meta.url),
    },
    {
      id: IDS.testBlogPersian,
      locale: "fa" as const,
      title: "ساخت یک پورتفولیوی دوزبانه و قابل نگهداری",
      slug: "ساخت-پورتفولیوی-دوزبانه-قابل-نگهداری",
      excerpt:
        "یک مقالهٔ آزمایشی بلند دربارهٔ معماری، تایپوگرافی، گردش کار محتوا، کارایی و آزمون در پورتفولیوی انگلیسی و فارسی.",
      seoTitle: "راهنمای ساخت پورتفولیوی دوزبانه و قابل نگهداری",
      seoDescription:
        "راهنمایی عملی برای معماری، تایپوگرافی، مدیریت محتوا، کارایی و آزمون یک پورتفولیوی انگلیسی و فارسی.",
      fixture: new URL("./fixtures/test-blog.fa.md", import.meta.url),
    },
  ];

  await prisma.post.upsert({
    where: { id: IDS.testBlogPost },
    update: {},
    create: {
      id: IDS.testBlogPost,
      featured: true,
      version: 1,
    },
  });

  for (const translation of translations) {
    const bodyMarkdown = (await readFile(translation.fixture, "utf8"))
      .replace(/\r\n?/g, "\n")
      .trim();
    const rendered = await renderArticleBody(bodyMarkdown);
    const bodySha256 = createHash("sha256")
      .update(bodyMarkdown, "utf8")
      .digest("hex");

    await prisma.postTranslation.upsert({
      where: {
        postId_locale: {
          postId: IDS.testBlogPost,
          locale: translation.locale,
        },
      },
      update: {},
      create: {
        id: translation.id,
        postId: IDS.testBlogPost,
        locale: translation.locale,
        title: translation.title,
        slug: translation.slug,
        excerpt: translation.excerpt,
        seoTitle: translation.seoTitle,
        seoDescription: translation.seoDescription,
        status: "PUBLISHED",
        publishedAt: TEST_BLOG_PUBLISHED_AT,
        bodyMarkdown,
        bodySha256,
        readingMinutes: rendered.readingTimeMinutes,
        headingTree: JSON.parse(JSON.stringify(rendered.headings)),
        renderedHtml: rendered.html,
        rendererVersion: rendered.rendererVersion,
        frontmatterSchemaVersion: CURRENT_FRONTMATTER_VERSION,
        version: 1,
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
  await seedTestBlog();

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
    pageSectionTranslations: 6,
    navItems: 6,
    socialLinks: 4,
  };

  // Historical Persian portfolio translations are intentionally retained even
  // though the current portfolio shell is English-only. Require the six seeded
  // English rows, but do not reject a migrated database for retaining those
  // valid historical rows. The remaining structural collections are closed
  // sets and therefore still use exact counts.
  for (const [key, value] of Object.entries(expected)) {
    const actual = counts[key as keyof typeof counts];
    const valid =
      key === "pageSectionTranslations" ? actual >= value : actual === value;
    if (!valid) {
      const qualifier = key === "pageSectionTranslations" ? "at least " : "";
      throw new Error(
        `Seed produced ${actual} ${key}, expected ${qualifier}${value}.`
      );
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
