import "server-only";

import certificates from "@/DataBase/Certificate.json";
import pageSections from "@/DataBase/PageSections.json";
import projects from "@/DataBase/Projects.json";
import quotes from "@/DataBase/DailyQuote.json";
import skills from "@/DataBase/Skills.json";
import type { CertificateType } from "@/Components/Certificate/Types";
import type { Quote } from "@/Components/DailyQuote/Types";
import type { Projects } from "@/Components/Projects/Types";
import type { SkillCategory } from "@/Components/Skills/Types";
import { getMessages } from "@/i18n/messages";
import { resolveAge } from "@/Utils/Age";
import { suggestSlug, type Locale } from "@portfolio/contracts/common";
import {
  BLOG_FONTS,
  fontSupportsLocale,
  publicAppearanceSchema,
  type PublicAppearance,
} from "@portfolio/contracts/appearance";
import {
  publicHomeSchema,
  publicProjectDetailItemSchema,
  publicSiteSchema,
  type PublicHome,
  type PublicProjectDetailItem,
  type PublicSite,
} from "@portfolio/contracts/portfolio";

/**
 * Temporary M4 rollback adapter. The public route imports only this server
 * module; once the API source lands, this is the sole legacy-read switch.
 */
export function getLegacyPortfolioData(): {
  readonly projects: readonly Projects[];
  readonly skills: readonly SkillCategory[];
  readonly certificates: readonly CertificateType[];
  readonly quotes: readonly Quote[];
} {
  return {
    projects: (projects as Omit<Projects, "slug" | "image">[]).map(
      (project) => ({
        ...project,
        slug: suggestSlug(project.title, "en").slug,
        image: null,
      })
    ),
    skills: skills as SkillCategory[],
    certificates: certificates as CertificateType[],
    quotes: quotes as Quote[],
  };
}

/** Exact legacy project detail used only by the explicit rollback source. */
export function getLegacyProjectDetail(
  slug: string
): PublicProjectDetailItem | null {
  const data = getLegacyPortfolioData();
  const project = data.projects.find((candidate) => candidate.slug === slug);
  if (project === undefined) return null;
  const allSkills = data.skills.flatMap((category) => category.items);
  const skills = project.technologies.flatMap((id) => {
    const skill = allSkills.find((candidate) => candidate.id === id);
    return skill === undefined
      ? []
      : [
          {
            id: legacyUuid(3, Number(skill.id)),
            name: skill.name,
            color: skill.color,
          },
        ];
  });
  return publicProjectDetailItemSchema.parse({
    id: legacyUuid(4, Number(project.id)),
    slug: project.slug,
    title: project.title,
    summary: project.description,
    status: project.status === "completed" ? "COMPLETED" : "IN_PROGRESS",
    demoUrl: project.link === "#" ? null : project.link,
    repositoryUrl: project.repo,
    featured: false,
    skillIds: skills.map((skill) => skill.id),
    image: null,
    longDescription: null,
    startedAt: null,
    completedAt: null,
    skills,
  });
}

/**
 * Isolated rollback view for site-shell data that was previously hard-coded in
 * Header, Footer, and the root metadata. Values stay here so client components
 * cannot silently become a second content source.
 */
export function getLegacySiteData(
  locale: Locale,
  now: Date = new Date()
): PublicSite {
  const messages = getMessages("en");
  const migratedSections = legacyPageSections(now);
  return publicSiteSchema.parse({
    locale,
    settings: {
      canonicalSiteUrl: "http://localhost:3000",
      defaultLocale: "en",
      enabledLocales: ["en"],
      siteName: "Amirreza Azarioun",
      titleTemplate: "%s | Amirreza Azarioun",
      metaDescription: "Amirreza Azarioun's portfolio site",
      authorName: "Amirreza Azarioun",
      creatorName: "Amirreza Azarioun",
      publisherName: "Amirreza Azarioun",
      contactEnabled: true,
      githubUsername: "amirrrreza1",
      githubRepoAllowlist: [
        "Portfolio",
        "FastFood-BurgerMaker",
        "Dastersi",
        "DigiKala-API-Code",
        "OS-Scheduler",
        "Finsweet",
        "Digikala-HTML-CSS",
        "Morse-Code",
        "Hangman",
        "RSS-Feed",
        "Tic-Tac-Toe",
        "Golestan-React",
        "Amazon-React",
      ],
      githubCacheTtlSeconds: 3_600,
      robotsAllowIndexing: true,
      keywords: ["Amirreza Azarioun", "software engineer", "portfolio"],
      footerLines: [],
      footerRights: messages.footer.rights,
      resumeButtonLabel: messages.resume.download,
      siteVerification: { google: null, bing: null },
    },
    sections: [
      ...migratedSections,
      { key: "skills", title: "Skills", content: {} },
      {
        key: "contact",
        title: "Get in Touch",
        content: {
          nameLabel: messages.contact.name,
          namePlaceholder: messages.contact.namePlaceholder,
          emailLabel: messages.contact.email,
          emailPlaceholder: messages.contact.emailPlaceholder,
          messageLabel: messages.contact.message,
          messagePlaceholder: messages.contact.messagePlaceholder,
          sendingLabel: messages.contact.sending,
          submitLabel: messages.contact.send,
          successMessage: messages.contact.success,
          failureMessage: messages.contact.failure,
          invalidNameMessage: messages.contact.invalidName,
          invalidEmailMessage: messages.contact.invalidEmail,
          invalidMessageMessage: messages.contact.invalidMessage,
        },
      },
      {
        key: "projects",
        title: "Projects",
        content: {},
      },
      {
        key: "certificates",
        title: "Certificates",
        content: {},
      },
    ],
    navigation: [
      nav("navhome00000000000000000", "Home", "hero"),
      nav("navabout0000000000000000", "About", "about"),
      nav("navskills000000000000000", "Skills", "skills"),
      {
        id: "navprojects0000000000000",
        label: "Projects",
        iconKey: null,
        targetKind: "INTERNAL_ROUTE",
        target: "/projects",
      },
      nav("navcertificates000000000", "Certificates", "certificates"),
      nav("navcontact00000000000000", "Contact", "contact"),
    ],
    socialLinks: [
      social(
        "socialgithub000000000000",
        "GitHub",
        "https://github.com/amirrrreza1"
      ),
      social(
        "sociallinkedin0000000000",
        "LinkedIn",
        "https://www.linkedin.com/in/amirrrreza1/"
      ),
      {
        id: "socialemail0000000000000",
        label: "Email",
        iconKey: null,
        rel: null,
        kind: "EMAIL",
        url: "mailto:arazarioun83@gmail.com",
      },
      {
        id: "socialdonate000000000000",
        label: "Donate",
        iconKey: null,
        rel: null,
        kind: "DONATE",
        url: "https://www.coffeebede.com/amirrrreza1",
      },
    ],
  });
}

function legacyPageSections(now: Date) {
  const source = pageSections as {
    readonly sections: readonly {
      readonly key: string;
      readonly content?: Readonly<Record<string, unknown>>;
      readonly english?: {
        readonly title: string;
        readonly content: Readonly<Record<string, unknown>>;
      };
    }[];
  };
  const hero = source.sections.find((section) => section.key === "hero");
  const about = source.sections.find((section) => section.key === "about");
  if (hero?.content === undefined || hero.english === undefined) {
    throw new Error("Legacy Hero content is missing.");
  }
  if (about?.content === undefined || about.english === undefined) {
    throw new Error("Legacy About content is missing.");
  }

  const age = resolveAge(process.env.BIRTH_DATE, now);
  const body = Array.isArray(about.english.content.body)
    ? about.english.content.body.map((paragraph) =>
        interpolateLegacyAge(
          String(paragraph),
          age.status === "ok" ? age.age : null
        )
      )
    : [];
  return [
    {
      key: "hero" as const,
      title: hero.english.title,
      content: { ...hero.content, ...hero.english.content },
    },
    {
      key: "about" as const,
      title: about.english.title,
      content: { ...about.content, ...about.english.content, body },
    },
  ];
}

function interpolateLegacyAge(source: string, age: number | null): string {
  return age === null
    ? source.replace(/,\s*\{\{age\}\}\s+years old/u, "")
    : source.replaceAll("{{age}}", String(age));
}

/** The pre-cutover appearance singleton, available only through rollback. */
export function getLegacyAppearanceData(locale: Locale): PublicAppearance {
  const fontKeys = ["jetbrains-mono", "vazir-code", "system-sans"] as const;
  return publicAppearanceSchema.parse({
    locale,
    themes: ["dark", "light"],
    defaultTheme: "dark",
    blogFonts: fontKeys
      .filter((key) => fontSupportsLocale(key, locale))
      .map((key) => ({ key, displayName: BLOG_FONTS[key].displayName })),
    defaultBlogFont: locale === "fa" ? "vazir-code" : "jetbrains-mono",
    blogSizes: ["sm", "md", "lg", "xl"],
    defaultBlogSize: "md",
    offerMotionToggle: true,
  });
}

/** Source-preserving homepage collection used only by explicit rollback. */
export function getLegacyHomeData(
  locale: Locale,
  now: Date = new Date()
): PublicHome {
  const quote = selectLegacyQuote(quotes as Quote[], now);
  return publicHomeSchema.parse({
    locale,
    quote:
      quote === undefined
        ? null
        : {
            id: legacyUuid(2, quote.id),
            text: quote.text,
            author: quote.author,
            sourceUrl: null,
          },
    certificates: (certificates as CertificateType[]).map((certificate) => ({
      id: legacyUuid(1, certificate.id),
      title: certificate.title,
      description: certificate.description,
      issuerName: certificate.institute,
      issuerUrl: certificate.instituteLink,
      instructorName: certificate.teacher,
      instructorUrl: certificate.teacherLink,
      scoreText: certificate.score,
      issuedAt: certificate.date.replaceAll("/", "-"),
      credentialUrl: null,
      downloadPath: certificate.filePath,
    })),
    resume: {
      label: "Resume",
      filename: "resume.pdf",
      downloadPath: "/resume.pdf",
    },
  });
}

function nav(id: string, label: string, target: string) {
  return {
    id,
    label,
    iconKey: null,
    targetKind: "SECTION_ANCHOR" as const,
    target,
  };
}

function social(id: string, label: string, url: string) {
  return {
    id,
    label,
    iconKey: null,
    rel: "noopener noreferrer",
    kind: "SOCIAL" as const,
    url,
  };
}

function selectLegacyQuote(
  values: readonly Quote[],
  now: Date
): Quote | undefined {
  if (values.length === 0) return undefined;
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const current = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const dayIndex = Math.floor((current - start) / 86_400_000);
  return values[dayIndex % values.length];
}

function legacyUuid(namespace: number, id: number): string {
  const suffix = String(namespace * 100_000_000_000 + id).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}
