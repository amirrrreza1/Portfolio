/** M7 exit-gate proof against a running API, PostgreSQL, and MinIO. */
import { hashPassword, issueRecoveryCodes } from "@portfolio/auth-core";
import { createDatabaseClient, type Database } from "@portfolio/database";

if (!process.argv.includes("--apply")) {
  throw new Error("Refusing to run the destructive CMS proof without --apply.");
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const API = required("API_ORIGIN").replace(/\/$/, "");
const ORIGIN = required("WEB_ORIGIN").replace(/\/$/, "");
const RECOVERY_SECRET = required("RECOVERY_SECRET");
const database: Database = createDatabaseClient({
  connectionString: required("DATABASE_URL"),
});

let checks = 0;
let failures = 0;
const proofStarted = new Date();
const check = (label: string, ok: boolean, detail = ""): void => {
  checks += 1;
  if (!ok) failures += 1;
  process.stdout.write(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}\n`
  );
};
const section = (title: string): void =>
  void process.stdout.write(`\n## ${title}\n`);

interface HttpResult {
  readonly status: number;
  readonly headers: Headers;
  readonly body: string;
  readonly cookies: readonly string[];
}
async function call(
  path: string,
  init: {
    readonly method?: string;
    readonly body?: unknown;
    readonly form?: FormData;
    readonly cookie?: string;
    readonly csrf?: string;
    readonly ifMatch?: number;
  } = {}
): Promise<HttpResult> {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
  };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.cookie) headers.cookie = init.cookie;
  if (init.csrf) headers["x-csrf-token"] = init.csrf;
  if (init.ifMatch !== undefined) headers["if-match"] = String(init.ifMatch);
  const response = await fetch(`${API}${path}`, {
    method:
      init.method ??
      (init.body === undefined && init.form === undefined ? "GET" : "POST"),
    headers,
    ...(init.form !== undefined
      ? { body: init.form }
      : init.body === undefined
        ? {}
        : { body: JSON.stringify(init.body) }),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
    cookies: response.headers.getSetCookie?.() ?? [],
  };
}
const data = <T>(response: HttpResult): T =>
  (JSON.parse(response.body) as { readonly data: T }).data;
const cookieValue = (
  cookies: readonly string[],
  name: string
): string | null => {
  for (const cookie of cookies) {
    const pair = cookie.split(";", 1)[0] ?? "";
    const [key, ...value] = pair.split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
};

const suffix = Date.now().toString(36);
const ownerId = crypto.randomUUID();
const ownerEmail = `m7-owner-${suffix}@example.invalid`;
const recovery = issueRecoveryCodes(RECOVERY_SECRET, 1)[0]!;
const recoveryCode = recovery.displayCode;
let ownerCookie = "";
let ownerCsrf = "";

async function provisionOwner(): Promise<void> {
  await database.user.create({
    data: {
      id: ownerId,
      email: ownerEmail,
      displayName: "M7 proof owner",
      role: "OWNER",
      status: "ACTIVE",
      passwordHash: await hashPassword("correct horse battery staple"),
      passwordChangedAt: new Date(),
      recoveryCodes: {
        create: {
          codeHash: recovery.hash,
        },
      },
    },
  });
}

try {
  await provisionOwner();

  section("1. Authenticated boundary and migrated inventory");
  const anonymous = await call("/api/v1/admin/settings");
  check("anonymous CMS reads are refused", anonymous.status === 401);
  const login = await call("/api/v1/auth/recovery/verify", {
    body: { email: ownerEmail, code: recoveryCode },
  });
  const session = cookieValue(login.cookies, "portfolio_session");
  ownerCsrf = cookieValue(login.cookies, "portfolio_csrf") ?? "";
  ownerCookie = `portfolio_session=${encodeURIComponent(session ?? "")}; portfolio_csrf=${encodeURIComponent(ownerCsrf)}`;
  check(
    "a real recovery flow establishes the owner session",
    login.status === 200 && session !== null && ownerCsrf.length > 0,
    `HTTP ${login.status}`
  );
  const categories = data<readonly unknown[]>(
    await call("/api/v1/admin/skill-categories", { cookie: ownerCookie })
  );
  const projects = data<readonly unknown[]>(
    await call("/api/v1/admin/projects", { cookie: ownerCookie })
  );
  const certificates = data<readonly unknown[]>(
    await call("/api/v1/admin/certificates", { cookie: ownerCookie })
  );
  const quotes = data<readonly unknown[]>(
    await call("/api/v1/admin/quotes", { cookie: ownerCookie })
  );
  check(
    "all six legacy skill categories are manageable",
    categories.filter((row: any) => row.legacyId !== null).length === 6
  );
  check(
    "all fourteen legacy projects are manageable",
    projects.filter((row: any) => row.legacyId !== null).length === 14
  );
  check(
    "all five legacy certificates are manageable",
    certificates.filter((row: any) => row.legacyId !== null).length === 5
  );
  check(
    "all thirty-five legacy quotes are manageable",
    quotes.filter((row: any) => row.legacyId !== null).length === 35
  );
  const noCsrf = await call("/api/v1/admin/quotes", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      textByLocale: { en: "must not persist" },
      author: null,
      sourceUrl: null,
      enabled: true,
      pinned: false,
      sortOrder: 9000,
    },
  });
  check("cookie mutations without CSRF are refused", noCsrf.status === 403);

  section("2. Settings, authored text, and conflict safety");
  const settingsRead = await call("/api/v1/admin/settings", {
    cookie: ownerCookie,
  });
  const settings = data<any>(settingsRead);
  check(
    "settings expose date-only birth data and normalized verification controls",
    (settings.birthDate === null ||
      /^\d{4}-\d{2}-\d{2}$/.test(settings.birthDate)) &&
      Object.keys(settings.searchConsoleTokens).sort().join(",") ===
        "bing,google"
  );
  const settingsBody = {
    settings: {
      canonicalSiteUrl: settings.canonicalSiteUrl,
      defaultLocale: settings.defaultLocale,
      enabledLocales: settings.enabledLocales,
      timezone: "Asia/Tehran",
      defaultSocialImageId: settings.defaultSocialImageId,
      authorName: settings.authorName,
      creatorName: settings.creatorName,
      publisherName: settings.publisherName,
      contactRecipientEmail: settings.contactRecipientEmail,
      contactEnabled: settings.contactEnabled,
      contactRetentionDays: 90,
      auditRetentionDays: 400,
      searchConsoleTokens: { google: `m7-${suffix}`, bing: null },
      githubUsername: settings.githubUsername,
      githubRepoAllowlist: settings.githubRepoAllowlist,
      githubCacheTtlSeconds: settings.githubCacheTtlSeconds,
      robotsAllowIndexing: settings.robotsAllowIndexing,
      birthDate: settings.birthDate,
    },
  };
  const settingsSaved = await call("/api/v1/admin/settings", {
    method: "PATCH",
    cookie: ownerCookie,
    csrf: ownerCsrf,
    ifMatch: settings.version,
    body: settingsBody,
  });
  check(
    "owner can persist settings through the API",
    settingsSaved.status === 200
  );
  const stale = await call("/api/v1/admin/settings", {
    method: "PATCH",
    cookie: ownerCookie,
    csrf: ownerCsrf,
    ifMatch: settings.version,
    body: settingsBody,
  });
  check(
    "a stale version returns conflict and cannot overwrite",
    stale.status === 409 && stale.body.includes("currentVersion"),
    `HTTP ${stale.status}`
  );
  const enText = settings.translations.find((row: any) => row.locale === "en");
  const textSaved = await call("/api/v1/admin/settings/translations/en", {
    method: "PATCH",
    cookie: ownerCookie,
    csrf: ownerCsrf,
    ifMatch: enText.version,
    body: {
      siteName: enText.siteName,
      titleTemplate: enText.titleTemplate,
      metaDescription: enText.metaDescription,
      keywords: ["portfolio", `m7-${suffix}`],
      footerLines: ["M7 verified"],
      footerRights: "All rights reserved",
      resumeButtonLabel: "Download verified resume",
    },
  });
  check(
    "SEO, footer, and resume labels persist per locale",
    textSaved.status === 200
  );
  const sections = data<readonly any[]>(
    await call("/api/v1/admin/sections", { cookie: ownerCookie })
  );
  const contact = sections.find((row) => row.key === "contact");
  const contactEn = contact.translations.find(
    (row: any) => row.locale === "en"
  );
  const contactSaved = await call(
    `/api/v1/admin/sections/${contact.id}/translations/en`,
    {
      method: "PATCH",
      cookie: ownerCookie,
      csrf: ownerCsrf,
      ifMatch: contactEn.version,
      body: {
        key: "contact",
        translation: {
          title: "Get in touch",
          content: {
            nameLabel: "Name",
            namePlaceholder: "Your name",
            emailLabel: "Email",
            emailPlaceholder: "you@example.com",
            messageLabel: "Message",
            messagePlaceholder: "Write your message",
            sendingLabel: "Sending",
            submitLabel: "Send message",
            successMessage: "Message received",
            failureMessage: "Please try again",
            invalidNameMessage: "Enter a valid name",
            invalidEmailMessage: "Enter a valid email",
            invalidMessageMessage: "Enter a longer message",
          },
        },
      },
    }
  );
  check(
    "contact labels and outcome messages persist per locale",
    contactSaved.status === 200
  );

  section("3. Content relationships and archive protections");
  const categoryCreated = await call("/api/v1/admin/skill-categories", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    body: { key: `m7-${suffix}`, enabled: true, sortOrder: 9000 },
  });
  const category = data<any>(categoryCreated);
  check("a skill category can be created", categoryCreated.status === 201);
  const skillCreated = await call("/api/v1/admin/skills", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    body: {
      categoryId: category.id,
      name: `M7 Skill ${suffix}`,
      color: "#0070f3",
      iconMediaId: null,
      enabled: true,
      sortOrder: 9000,
    },
  });
  const skill = data<any>(skillCreated);
  check("a skill can be related to its category", skillCreated.status === 201);
  const projectCreated = await call("/api/v1/admin/projects", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    body: {
      slug: `m7-${suffix}`,
      status: "IN_PROGRESS",
      demoUrl: null,
      repositoryUrl: null,
      imageId: null,
      featured: false,
      enabled: true,
      sortOrder: 9000,
      startedAt: "2026-08-28",
      completedAt: null,
      skills: [{ skillId: skill.id, sortOrder: 0 }],
    },
  });
  const project = data<any>(projectCreated);
  check(
    "project and ordered skill relation commit together",
    projectCreated.status === 201
  );
  const blockedArchive = await call(
    `/api/v1/admin/resources/skills/${skill.id}/archive`,
    {
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: { confirm: true, version: skill.version },
    }
  );
  check("referenced content cannot be archived", blockedArchive.status === 400);
  const archived = await call(
    `/api/v1/admin/resources/projects/${project.id}/archive`,
    {
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: { confirm: true, version: project.version },
    }
  );
  const archivedProject = data<any>(archived);
  const restored = await call(
    `/api/v1/admin/resources/projects/${project.id}/restore`,
    {
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: { confirm: true, version: archivedProject.version },
    }
  );
  check(
    "archive and restore are explicit, versioned operations",
    archived.status === 201 && restored.status === 201,
    `${archived.status}/${restored.status}`
  );

  section("4. Verified media and atomic resume activation");
  const pdf = new Blob(
    ["%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF\n"],
    { type: "application/pdf" }
  );
  const validForm = new FormData();
  validForm.set("kind", "DOCUMENT");
  validForm.set("visibility", "PRIVATE");
  validForm.set("altText", "");
  validForm.set("file", pdf, `m7-${suffix}.pdf`);
  const uploaded = await call("/api/v1/admin/media", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    form: validForm,
  });
  const media = data<any>(uploaded);
  check(
    "verified PDF upload stores safe metadata without an object key",
    uploaded.status === 201 &&
      media.processingState === "VERIFIED" &&
      !uploaded.body.includes("storageKey")
  );
  const unsafeForm = new FormData();
  unsafeForm.set("kind", "DOCUMENT");
  unsafeForm.set("visibility", "PUBLIC");
  unsafeForm.set("altText", "");
  unsafeForm.set(
    "file",
    new Blob(
      [
        "%PDF-1.7\n1 0 obj\n<< /Type /Page /OpenAction 2 0 R >>\nendobj\n%%EOF\n",
      ],
      { type: "application/pdf" }
    ),
    "active.pdf"
  );
  const rejected = await call("/api/v1/admin/media", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    form: unsafeForm,
  });
  check(
    "active PDF content is quarantined and refused",
    rejected.status === 415 && rejected.body.includes("quarantinedMediaId")
  );
  const resumeCreated = await call("/api/v1/admin/resumes", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    body: {
      mediaAssetId: media.id,
      label: `M7 resume ${suffix}`,
      publicFilename: "resume-m7.pdf",
    },
  });
  const resume = data<any>(resumeCreated);
  const activated = await call(`/api/v1/admin/resumes/${resume.id}/activate`, {
    method: "POST",
    cookie: ownerCookie,
    csrf: ownerCsrf,
    ifMatch: resume.version,
  });
  const activeCount = await database.resumeVersion.count({
    where: { activatedAt: { not: null }, retiredAt: null },
  });
  check(
    "resume replacement retires the old version atomically",
    activated.status === 201 && activeCount === 1,
    `HTTP ${activated.status}; ${activeCount} active; ${activated.body.slice(0, 200)}`
  );

  section("5. Revision, audit, invalidation, and role evidence");
  const resourceTypes = new Set(
    (
      await database.contentRevision.findMany({
        where: { actorId: ownerId },
        select: { entityType: true },
      })
    ).map((row) => row.entityType)
  );
  check(
    "mutated resource families produced immutable revisions",
    [
      "SiteSettings",
      "SiteSettingsTranslation",
      "PageSectionTranslation",
      "SkillCategory",
      "Skill",
      "Project",
      "MediaAsset",
      "ResumeVersion",
    ].every((type) => resourceTypes.has(type)),
    [...resourceTypes].sort().join(", ")
  );
  const auditCount = await database.auditEvent.count({
    where: { actorId: ownerId, outcome: "SUCCESS" },
  });
  const invalidationCount = await database.contentInvalidationOutbox.count({
    where: { createdAt: { gte: proofStarted } },
  });
  check(
    "successful CMS writes are audited",
    auditCount >= 10,
    `${auditCount} events`
  );
  check(
    "CMS writes create durable cache invalidations",
    invalidationCount >= 10,
    `${invalidationCount} events`
  );
  // The v1 editor-permission ADR has not landed, so DECISIONS.md and
  // authorization.ts both say EDITOR must not be grantable yet. The API has to
  // refuse it, and the grant table still has to be right for the day it does
  // land — so the matrix is proven against a row seeded directly, not against
  // a role the API handed out.
  const editorEmail = `m7-editor-${suffix}@example.invalid`;
  const editorRecovery = issueRecoveryCodes(RECOVERY_SECRET, 1)[0]!;
  const refusedEditor = await call("/api/v1/admin/users", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    body: {
      email: `refused-${editorEmail}`,
      displayName: "M7 refused editor",
      role: "EDITOR",
      password: "editor correct horse battery staple",
    },
  });
  check(
    "the API refuses to grant EDITOR while its permission ADR is open",
    refusedEditor.status === 400 || refusedEditor.status === 422,
    `HTTP ${refusedEditor.status}`
  );
  const editor = await database.user.create({
    data: {
      email: editorEmail,
      displayName: "M7 proof editor",
      role: "EDITOR",
      status: "ACTIVE",
      passwordHash: await hashPassword("editor correct horse battery staple"),
      passwordChangedAt: new Date(),
      recoveryCodes: { create: { codeHash: editorRecovery.hash } },
    },
  });
  const editorLogin = await call("/api/v1/auth/recovery/verify", {
    body: { email: editorEmail, code: editorRecovery.displayCode },
  });
  const editorSession = cookieValue(editorLogin.cookies, "portfolio_session");
  const editorCookie = `portfolio_session=${encodeURIComponent(editorSession ?? "")}`;
  const editorProjects = await call("/api/v1/admin/projects", {
    cookie: editorCookie,
  });
  const editorSettings = await call("/api/v1/admin/settings", {
    cookie: editorCookie,
  });
  check(
    "a v1 editor can read drafts but cannot manage settings",
    editor.role === "EDITOR" &&
      editorProjects.status === 200 &&
      editorSettings.status === 403,
    `${editorProjects.status}/${editorSettings.status}`
  );
  const auditView = await call("/api/v1/admin/audit-events", {
    cookie: ownerCookie,
  });
  const dashboard = await call("/api/v1/admin/dashboard", {
    cookie: ownerCookie,
  });
  check(
    "owner-only audit and health views are live and non-cacheable",
    auditView.status === 200 &&
      dashboard.status === 200 &&
      auditView.headers.get("cache-control") === "private, no-store"
  );

  section("6. Public exposure of what the CMS just changed");
  const publicSite = await fetch(`${API}/api/v1/public/en/site`);
  const publicSiteBody = (await publicSite.json()) as any;
  const publicSettings = publicSiteBody?.data?.settings ?? {};
  const publicContact = (publicSiteBody?.data?.sections ?? []).find(
    (entry: any) => entry?.key === "contact"
  );
  check(
    "authored SEO, footer, and contact copy reach the public site read",
    publicSite.status === 200 &&
      publicSettings.keywords?.includes(`m7-${suffix}`) === true &&
      publicSettings.siteVerification?.google === `m7-${suffix}` &&
      publicContact?.content?.submitLabel === "Send message",
    `HTTP ${publicSite.status}`
  );
  check(
    "the public site never exposes the raw verification blob",
    !JSON.stringify(publicSiteBody).includes("searchConsoleTokens")
  );

  // A project authored in the CMS before its English translation exists is a
  // normal state. It must not decide whether the rest of the collection
  // renders: this once returned 500 for the whole locale and took the public
  // site down behind it.
  const publicProjects = await fetch(`${API}/api/v1/public/en/projects`);
  const publicProjectsBody = (await publicProjects.json()) as any;
  const untranslatedIsPublic = (publicProjectsBody?.data?.projects ?? []).some(
    (entry: any) => entry?.id === project.id
  );
  check(
    "an untranslated record is withheld, not fatal, on public discovery",
    publicProjects.status === 200 && !untranslatedIsPublic,
    `HTTP ${publicProjects.status}`
  );
  const untranslatedDetail = await fetch(
    `${API}/api/v1/public/en/projects/m7-${suffix}`
  );
  check(
    "the untranslated record's detail page is a clean 404, not a crash",
    untranslatedDetail.status === 404,
    `HTTP ${untranslatedDetail.status}`
  );

  const publicHome = await fetch(`${API}/api/v1/public/en/home`);
  const publicHomeBody = (await publicHome.json()) as any;
  const download = publicHomeBody?.data?.resume?.downloadPath ?? "";
  const resumeFile = await fetch(`${API}${download}`);
  check(
    "the activated resume is served from a stable path with SECURITY.md §8 headers",
    publicHome.status === 200 &&
      publicHomeBody?.data?.resume?.filename === "resume-m7.pdf" &&
      resumeFile.status === 200 &&
      resumeFile.headers.get("content-type") === "application/pdf" &&
      resumeFile.headers.get("x-content-type-options") === "nosniff" &&
      (resumeFile.headers.get("content-disposition") ?? "").startsWith(
        "attachment;"
      ) &&
      !download.includes("media/"),
    `${download} -> HTTP ${resumeFile.status}`
  );
} catch (error) {
  failures += 1;
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`
  );
} finally {
  await database.$disconnect();
}

process.stdout.write(`\n${checks - failures}/${checks} checks passed.\n`);
if (failures > 0) process.exitCode = 1;
else process.stdout.write("ALL M7 CHECKS PASSED\n");
