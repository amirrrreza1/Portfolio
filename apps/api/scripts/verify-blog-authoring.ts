/** M8 authoring/import proof against the authenticated live boundary. */
import { hashPassword, issueRecoveryCodes } from "@portfolio/auth-core";
import { createDatabaseClient, type Database } from "@portfolio/database";

if (!process.argv.includes("--apply")) {
  throw new Error(
    "Refusing to run the destructive blog proof without --apply."
  );
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
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: "manual",
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
    cookies: response.headers.getSetCookie?.() ?? [],
  };
}

async function callMultipart(
  path: string,
  form: FormData,
  cookie: string,
  csrf: string
): Promise<HttpResult> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      cookie,
      "x-csrf-token": csrf,
    },
    body: form,
    redirect: "manual",
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
    cookies: response.headers.getSetCookie?.() ?? [],
  };
}

function data<T>(result: HttpResult): T {
  return (JSON.parse(result.body) as { data: T }).data;
}
function fields(result: HttpResult): Record<string, string[]> {
  const parsed = JSON.parse(result.body) as {
    error?: { fields?: Record<string, string[]> };
  };
  return parsed.error?.fields ?? {};
}
const cookieValue = (
  cookies: readonly string[],
  name: string
): string | null => {
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const [key, ...value] = (pair ?? "").split("=");
    if (key?.trim() === name) return decodeURIComponent(value.join("="));
  }
  return null;
};

const suffix = Date.now().toString(36);
const ownerId = crypto.randomUUID();
const ownerEmail = `m8-owner-${suffix}@example.invalid`;
const recovery = issueRecoveryCodes(RECOVERY_SECRET, 1)[0]!;
const postId = `p${suffix.padEnd(23, "0").slice(0, 23)}`;
let ownerCookie = "";
let ownerCsrf = "";

const body = [
  "A paragraph that introduces the article and links to [another post](/en/blog/other).",
  "",
  "## A section heading",
  "",
  "- A list item",
  "- Another list item",
  "",
  "> A quotation.",
  "",
  "```ts",
  'const theme: string = "dark";',
  "```",
  "",
  "A closing paragraph with enough words to clear the short-body warning. ".repeat(
    12
  ),
].join("\n");

function frontmatter(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    postId,
    locale: "en",
    title: `The M8 authoring slice ${suffix}`,
    slug: `m8-authoring-${suffix}`,
    excerpt: "Proving the authenticated blog boundary against a live stack.",
    status: "draft",
    publishedAt: null,
    scheduledFor: null,
    seoTitle: null,
    seoDescription: "Proving the authenticated blog boundary.",
    canonicalUrl: null,
    category: `m8-cat-${suffix}`,
    tags: [`m8-tag-${suffix}`],
    coverImage: null,
    socialImage: null,
    ...overrides,
  };
}

try {
  await database.user.create({
    data: {
      id: ownerId,
      email: ownerEmail,
      displayName: "M8 proof owner",
      role: "OWNER",
      status: "ACTIVE",
      passwordHash: await hashPassword("correct horse battery staple"),
      passwordChangedAt: new Date(),
      recoveryCodes: { create: { codeHash: recovery.hash } },
    },
  });

  section("1. The authoring boundary");
  const anonymous = await call("/api/v1/admin/blog/posts");
  check("anonymous authoring reads are refused", anonymous.status === 401);

  const login = await call("/api/v1/auth/recovery/verify", {
    body: { email: ownerEmail, code: recovery.displayCode },
  });
  const session = cookieValue(login.cookies, "portfolio_session");
  ownerCsrf = cookieValue(login.cookies, "portfolio_csrf") ?? "";
  ownerCookie = `portfolio_session=${encodeURIComponent(session ?? "")}; portfolio_csrf=${encodeURIComponent(ownerCsrf)}`;
  check(
    "a real recovery flow establishes the owner session",
    login.status === 200 && session !== null && ownerCsrf.length > 0,
    `HTTP ${login.status}`
  );

  const noCsrf = await call("/api/v1/admin/blog/tags", {
    cookie: ownerCookie,
    body: { key: `nope-${suffix}`, enabled: true, sortOrder: 0 },
  });
  check("cookie mutations without CSRF are refused", noCsrf.status === 403);

  const listed = await call("/api/v1/admin/blog/posts", {
    cookie: ownerCookie,
  });
  check(
    "authoring reads are never cacheable",
    listed.status === 200 &&
      listed.headers.get("cache-control") === "private, no-store" &&
      (listed.headers.get("vary") ?? "").includes("Cookie"),
    `${listed.headers.get("cache-control")} / ${listed.headers.get("vary")}`
  );

  section("2. Taxonomy is created explicitly, never implied");
  const categoryCreated = await call("/api/v1/admin/blog/categories", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    body: { key: `m8-cat-${suffix}`, enabled: true, sortOrder: 10 },
  });
  const category = data<any>(categoryCreated);
  const tagCreated = await call("/api/v1/admin/blog/tags", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    body: { key: `m8-tag-${suffix}`, enabled: true, sortOrder: 10 },
  });
  const tag = data<any>(tagCreated);
  check(
    "a category and a tag can be created",
    categoryCreated.status === 201 && tagCreated.status === 201,
    `${categoryCreated.status}/${tagCreated.status}`
  );

  const categoryTranslated = await call(
    `/api/v1/admin/blog/categories/${category.id}/translations/en`,
    {
      method: "PUT",
      cookie: ownerCookie,
      csrf: ownerCsrf,
      ifMatch: category.version,
      body: {
        name: "Engineering",
        slug: `engineering-${suffix}`,
        description: null,
      },
    }
  );
  check(
    "a taxonomy translation is versioned against its parent row",
    categoryTranslated.status === 200,
    `HTTP ${categoryTranslated.status}`
  );
  const staleTaxonomy = await call(
    `/api/v1/admin/blog/categories/${category.id}/translations/fa`,
    {
      method: "PUT",
      cookie: ownerCookie,
      csrf: ownerCsrf,
      ifMatch: category.version,
      body: { name: "مهندسی", slug: `مهندسی-${suffix}`, description: null },
    }
  );
  check(
    "a second locale saved from a stale screen is refused",
    staleTaxonomy.status === 409,
    `HTTP ${staleTaxonomy.status}`
  );

  section("3. Save, autosave, and optimistic concurrency");
  const saved = await call(
    `/api/v1/admin/blog/posts/${postId}/translations/en`,
    {
      method: "PUT",
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: { frontmatter: frontmatter(), body, baseVersion: null },
    }
  );
  const translation = data<any>(saved);
  check(
    "an explicit save renders and persists source, digest, and version",
    saved.status === 200 &&
      typeof translation.bodySha256 === "string" &&
      translation.bodySha256.length === 64,
    `HTTP ${saved.status}`
  );

  const mismatched = await call(
    `/api/v1/admin/blog/posts/${postId}/translations/fa`,
    {
      method: "PUT",
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: { frontmatter: frontmatter(), body, baseVersion: null },
    }
  );
  check(
    "a body that disagrees with its path cannot write elsewhere",
    mismatched.status === 400,
    `HTTP ${mismatched.status}`
  );

  const stale = await call(
    `/api/v1/admin/blog/posts/${postId}/translations/en`,
    {
      method: "PUT",
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: { frontmatter: frontmatter(), body, baseVersion: null },
    }
  );
  const afterStale = await database.postTranslation.findUniqueOrThrow({
    where: { postId_locale: { postId, locale: "en" } },
    select: { version: true },
  });
  check(
    "a stale save conflicts and writes nothing",
    stale.status === 409 && afterStale.version === translation.version,
    `HTTP ${stale.status}; version ${afterStale.version}`
  );

  const autosaved = await call(
    `/api/v1/admin/blog/posts/${postId}/translations/en/draft`,
    {
      method: "PUT",
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: {
        body: `${body}\n\nAn unsaved sentence.`,
        baseVersion: translation.version,
      },
    }
  );
  const committed = await database.postTranslation.findUniqueOrThrow({
    where: { postId_locale: { postId, locale: "en" } },
    select: { version: true, bodyMarkdown: true },
  });
  check(
    "autosave writes the draft and never touches the published row",
    autosaved.status === 200 &&
      committed.version === translation.version &&
      !(committed.bodyMarkdown ?? "").includes("An unsaved sentence."),
    `HTTP ${autosaved.status}; version ${committed.version}`
  );

  const reread = data<any>(
    await call(`/api/v1/admin/blog/posts/${postId}/translations/en`, {
      cookie: ownerCookie,
    })
  );
  check(
    "the editor read reports the newer draft beside the saved body",
    reread.draft !== null && reread.draft.aheadOfSave === true,
    JSON.stringify(reread.draft?.aheadOfSave)
  );

  section("4. The publish checklist gates the transition");
  const checklist = data<any>(
    await call(`/api/v1/admin/blog/posts/${postId}/translations/en/checklist`, {
      cookie: ownerCookie,
    })
  );
  check(
    "the checklist raises no blockers for a complete article",
    checklist.blockers.length === 0,
    `blockers: ${checklist.blockers.join(", ") || "none"}`
  );

  const unacknowledged = await call(
    `/api/v1/admin/blog/posts/${postId}/translations/en/publish`,
    {
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: { version: translation.version, acknowledgedWarnings: [] },
    }
  );
  const stillDraft = await database.postTranslation.findUniqueOrThrow({
    where: { postId_locale: { postId, locale: "en" } },
    select: { status: true },
  });
  check(
    "publishing with unacknowledged warnings is refused and writes nothing",
    unacknowledged.status === 400 && stillDraft.status === "DRAFT",
    `HTTP ${unacknowledged.status}; ${stillDraft.status}`
  );
  check(
    "the refusal names the warnings the author has to see",
    (fields(unacknowledged).warnings ?? []).length ===
      checklist.warnings.length,
    (fields(unacknowledged).warnings ?? []).join(", ")
  );

  const published = await call(
    `/api/v1/admin/blog/posts/${postId}/translations/en/publish`,
    {
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: {
        version: translation.version,
        acknowledgedWarnings: checklist.warnings,
      },
    }
  );
  const live = data<any>(published);
  check(
    "acknowledging every warning publishes the translation",
    published.status === 201 && live.status === "PUBLISHED",
    `HTTP ${published.status}; ${live.status}`
  );

  section("5. Withdrawal, slug moves, and archiving");
  const publicBefore = await fetch(
    `${API}/api/v1/public/en/blog/posts/${frontmatter().slug}`
  );
  check(
    "the published article is readable on the public detail path",
    publicBefore.status === 200,
    `HTTP ${publicBefore.status}`
  );

  const withdrawn = data<any>(
    await call(`/api/v1/admin/blog/posts/${postId}/translations/en/unpublish`, {
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: { version: live.version, reason: "Proving the withdrawal path." },
    })
  );
  const publicAfter = await fetch(
    `${API}/api/v1/public/en/blog/posts/${frontmatter().slug}`
  );
  check(
    "a withdrawn article stops being publicly readable",
    withdrawn.status === "DRAFT" && publicAfter.status === 404,
    `${withdrawn.status}; HTTP ${publicAfter.status}`
  );

  const movedSlug = `m8-moved-${suffix}`;
  const moved = await call(
    `/api/v1/admin/blog/posts/${postId}/translations/en`,
    {
      method: "PUT",
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: {
        frontmatter: frontmatter({ slug: movedSlug }),
        body,
        baseVersion: withdrawn.version,
      },
    }
  );
  const redirect = await database.slugRedirect.findUnique({
    where: {
      locale_fromPath: {
        locale: "en",
        fromPath: `/en/blog/${frontmatter().slug}`,
      },
    },
  });
  check(
    "a slug change leaves a redirect from the old path",
    moved.status === 200 &&
      redirect?.toPath === `/en/blog/${movedSlug}` &&
      redirect.statusCode === 308,
    `${redirect?.fromPath} -> ${redirect?.toPath}`
  );

  const movedAgain = `m8-moved-again-${suffix}`;
  await call(`/api/v1/admin/blog/posts/${postId}/translations/en`, {
    method: "PUT",
    cookie: ownerCookie,
    csrf: ownerCsrf,
    body: {
      frontmatter: frontmatter({ slug: movedAgain }),
      body,
      baseVersion: data<any>(moved).version,
    },
  });
  const collapsed = await database.slugRedirect.findMany({
    where: { locale: "en", fromPath: { contains: suffix } },
    select: { fromPath: true, toPath: true },
    orderBy: { fromPath: "asc" },
  });
  check(
    "a second move collapses the chain instead of adding a hop",
    collapsed.length === 2 &&
      collapsed.every((row) => row.toPath === `/en/blog/${movedAgain}`),
    collapsed.map((row) => `${row.fromPath} -> ${row.toPath}`).join("; ")
  );

  const current = await database.postTranslation.findUniqueOrThrow({
    where: { postId_locale: { postId, locale: "en" } },
    select: { version: true },
  });
  const archived = await call(
    `/api/v1/admin/blog/posts/${postId}/translations/en/archive`,
    {
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: {
        version: current.version,
        reason: "Proving the archive path.",
        redirectTo: "/en/blog",
      },
    }
  );
  check(
    "archiving is versioned, explicit, and can leave a redirect",
    archived.status === 201 && data<any>(archived).status === "ARCHIVED",
    `HTTP ${archived.status}`
  );

  section("6. Markdown import review and confirmation");
  const rejectedForm = new FormData();
  rejectedForm.append("postId", "");
  rejectedForm.append("locale", "en");
  rejectedForm.append(
    "file",
    new Blob([
      "# Unsafe import\n\nA body submitted as data.\n\n{process.env.SECRET}\n",
    ]),
    "unsafe.mdx"
  );
  const rejectedImport = await callMultipart(
    "/api/v1/admin/blog/import",
    rejectedForm,
    ownerCookie,
    ownerCsrf
  );
  const rejectedReport = data<any>(rejectedImport);
  check(
    "executable MDX is reported with its uploaded line and cannot be confirmed",
    rejectedImport.status === 201 &&
      rejectedReport.accepted === false &&
      rejectedReport.findings.some(
        (finding: any) =>
          finding.code === "MDX_EXPRESSION" && finding.line === 5
      ),
    `HTTP ${rejectedImport.status}`
  );
  const rejectedSource = await database.mediaAsset.findUnique({
    where: { id: rejectedReport.quarantinedSourceId },
  });
  check(
    "the rejected original is retained only as a private quarantined object",
    rejectedSource?.processingState === "QUARANTINED" &&
      rejectedSource.visibility === "PRIVATE" &&
      rejectedSource.storageKey.endsWith(".mdx"),
    rejectedSource?.storageKey
  );

  const importedTitle = `M8 imported ${suffix}`;
  const acceptedForm = new FormData();
  acceptedForm.append("postId", "");
  acceptedForm.append("locale", "en");
  acceptedForm.append(
    "file",
    new Blob([
      `# ${importedTitle}\n\nThe first paragraph becomes the explicitly inferred excerpt.\n\n## Imported section\n\nSafe Markdown body.\n`,
    ]),
    "accepted.mdx"
  );
  const acceptedImport = await callMultipart(
    "/api/v1/admin/blog/import",
    acceptedForm,
    ownerCookie,
    ownerCsrf
  );
  const acceptedReport = data<any>(acceptedImport);
  check(
    "a plain MDX upload returns inferred metadata, normalized Markdown, and an exact diff",
    acceptedImport.status === 201 &&
      acceptedReport.accepted === true &&
      acceptedReport.normalizedFrontmatter.title === importedTitle &&
      acceptedReport.findings.some(
        (finding: any) => finding.code === "INFERRED_TITLE"
      ) &&
      acceptedReport.normalizedDocument.includes("status: draft") &&
      acceptedReport.diff.includes("+++ import.md"),
    `HTTP ${acceptedImport.status}`
  );
  const confirmedImport = await call("/api/v1/admin/blog/import", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    body: {
      postId: null,
      locale: "en",
      confirm: true,
      reportToken: acceptedReport.reportToken,
    },
  });
  const confirmed = data<any>(confirmedImport);
  const imported = await database.postTranslation.findUnique({
    where: {
      postId_locale: {
        postId: acceptedReport.normalizedFrontmatter.postId,
        locale: "en",
      },
    },
  });
  check(
    "report-token confirmation saves through the transactional article path",
    confirmedImport.status === 201 &&
      confirmed.postId === acceptedReport.normalizedFrontmatter.postId &&
      imported?.title === importedTitle &&
      imported.bodySha256 !== null &&
      imported.renderedHtml !== null,
    `HTTP ${confirmedImport.status}; version ${imported?.version}`
  );
  const reusedImport = await call("/api/v1/admin/blog/import", {
    cookie: ownerCookie,
    csrf: ownerCsrf,
    body: {
      postId: null,
      locale: "en",
      confirm: true,
      reportToken: acceptedReport.reportToken,
    },
  });
  check(
    "an import report token is single-use",
    reusedImport.status === 409,
    `HTTP ${reusedImport.status}`
  );

  section("7. Evidence written by the same transactions");
  const revisions = await database.contentRevision.count({
    where: { entityType: "PostTranslation", entityId: live.id },
  });
  const audits = await database.auditEvent.findMany({
    where: { targetType: "PostTranslation", targetId: live.id },
    select: { eventType: true },
  });
  const invalidations = await database.contentInvalidationOutbox.count({
    where: { cacheTag: { contains: "article" } },
  });
  check(
    "every transition left an immutable revision",
    revisions >= 4,
    `${revisions} revisions`
  );
  check(
    "every transition left a distinct audit event",
    ["published", "unpublished", "archived"].every((suffixName) =>
      audits.some((row) => row.eventType.endsWith(suffixName))
    ),
    [...new Set(audits.map((row) => row.eventType))].join(", ")
  );
  check(
    "every transition enqueued a durable invalidation",
    invalidations >= 4,
    `${invalidations} events`
  );

  const withdrawalReason = await database.auditEvent.findFirst({
    where: {
      targetId: live.id,
      eventType: "article.translation.unpublished",
    },
    select: { metadata: true },
  });
  const lastRevision = await database.contentRevision.findFirst({
    where: { entityType: "PostTranslation", entityId: live.id },
    orderBy: { createdAt: "desc" },
    select: { after: true },
  });
  check(
    "an operator reason is audited but never copied into the content revision",
    JSON.stringify(withdrawalReason?.metadata ?? {}).includes(
      "Proving the withdrawal path."
    ) && !JSON.stringify(lastRevision?.after ?? {}).includes("reason"),
    "reason in audit only"
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
else process.stdout.write("ALL M8 AUTHORING AND IMPORT CHECKS PASSED\n");
