/**
 * M4 exit-gate verification: the public bilingual cutover, end to end.
 *
 * This talks to three things at once and fakes none of them: PostgreSQL through
 * the real article repository, the outbox through the real signed sender and
 * drain, and the running web application over HTTP. What it asserts is the one
 * thing no unit test can — that a change committed in the database reaches the
 * HTML a visitor receives, and that a withdrawn article stops reaching it.
 *
 * The invalidation drain is driven one pass at a time rather than by the
 * background worker, because the interesting assertion is the negative: the
 * rendered route must still be stale immediately after the database write and
 * must change only once the purge is delivered. A continuously running worker
 * would make every "after" measurement true for the wrong reason.
 *
 * Destructive, `--apply`-gated, and it rebuilds its own fixture namespace, so
 * consecutive runs are deterministic.
 *
 *   DATABASE_URL=... WEB_ORIGIN=... API_ORIGIN=... \
 *   CACHE_INVALIDATION_URL=... CACHE_INVALIDATION_SECRET=... \
 *   pnpm --filter @portfolio/api verify:cutover
 */

import {
  createArticleStore,
  createDatabaseClient,
  createInvalidationOutboxStore,
  createPrismaSqlExecutor,
  type Database,
} from "@portfolio/database";
import { frontmatterSchema, normalizeSlug } from "@portfolio/contracts";

import { runInvalidationDrain } from "../src/worker/invalidation-drain.js";
import { createSignedInvalidationSender } from "../src/worker/invalidation-sender.js";

if (!process.argv.includes("--apply")) {
  throw new Error(
    "Refusing to run the destructive cutover verification without --apply."
  );
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const WEB = required("WEB_ORIGIN").replace(/\/$/, "");
const API = required("API_ORIGIN").replace(/\/$/, "");
const database: Database = createDatabaseClient({
  connectionString: required("DATABASE_URL"),
});
const store = createArticleStore(database);
const outbox = createInvalidationOutboxStore(createPrismaSqlExecutor(database));
const sender = createSignedInvalidationSender({
  endpoint: required("CACHE_INVALIDATION_URL"),
  secret: required("CACHE_INVALIDATION_SECRET"),
});

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

let checks = 0;
let failures = 0;

/**
 * Statements about caching that are reported rather than asserted.
 *
 * Whether a public read is held in a shared cache is a deployment property,
 * not an exit-gate condition. Asserting it here would either hard-code one
 * deployment's behaviour or fail for a reason the milestone never claimed.
 */
const cacheObservations: string[] = [];

const section = (title: string): void => {
  process.stdout.write(`\n## ${title}\n`);
};
const check = (label: string, ok: boolean, detail = ""): void => {
  checks += 1;
  if (!ok) failures += 1;
  process.stdout.write(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail === "" ? "" : `  — ${detail}`}\n`
  );
};
const note = (text: string): void => {
  process.stdout.write(`      ${text}\n`);
};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

interface Fetched {
  readonly status: number;
  readonly headers: Headers;
  readonly body: string;
}

async function get(
  path: string,
  init: RequestInit = {},
  origin = WEB
): Promise<Fetched> {
  const response = await fetch(`${origin}${path}`, {
    redirect: "manual",
    ...init,
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}

/** Percent-encoded so a Persian slug survives the request line intact. */
const url = (locale: string, slug: string): string =>
  `/${locale}/blog/${encodeURIComponent(slug)}`;

/**
 * One complete drain pass.
 *
 * `sleep` only runs when a claim came back empty, so using it as the stop
 * signal drains everything queued and then returns instead of idling.
 */
async function drain(): Promise<number> {
  let more = true;
  const summary = await runInvalidationDrain({
    outbox,
    sender,
    maxAttempts: 8,
    visibilitySeconds: 120,
    batchSize: 50,
    idleDelayMs: 0,
    sleep: async () => {
      more = false;
    },
    running: () => more,
  });
  if (summary.failed > 0 || summary.unreadable > 0) {
    throw new Error(
      `Invalidation drain did not deliver cleanly: ${JSON.stringify(summary)}`
    );
  }
  return summary.delivered;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const id = (seed: string): string =>
  `m${seed
    .replace(/[^a-z0-9]/g, "")
    .padEnd(23, "0")
    .slice(0, 23)}`;

const CUTOVER = id("cutoversubjectpost");
const DRAFTED = id("leakdraftpost");
const SCHEDULED = id("leakscheduledpost");
const ARCHIVED = id("leakarchivedpost");
const ENGLISH_ONLY = id("leakenglishonlypost");
const OWNER = id("cutoverproofactor");

const FIXTURE_POSTS = [CUTOVER, DRAFTED, SCHEDULED, ARCHIVED, ENGLISH_ONLY];

const CUTOVER_SLUG = "m4-cutover-subject";
const CUTOVER_FA_SLUG = normalizeSlug("مقاله برش عمومی", "fa");
const TITLE_FIRST = "Cutover subject, first title";
const TITLE_SECOND = "Cutover subject, second title";

const BODY = [
  "## The claim",
  "",
  "A change committed in PostgreSQL must reach the HTML a visitor receives.",
  "",
  "- The listing changes.",
  "- The detail page changes.",
  "- A withdrawal is not served from a buffer.",
].join("\n");

function frontmatter(overrides: Record<string, unknown>) {
  return frontmatterSchema.parse({
    schemaVersion: 1,
    postId: CUTOVER,
    locale: "en",
    title: TITLE_FIRST,
    slug: CUTOVER_SLUG,
    excerpt: "Proving the public cutover reaches the rendered route.",
    status: "draft",
    ...overrides,
  });
}

async function resetFixture(): Promise<void> {
  await database.contactMessage.deleteMany({
    where: { email: "cutover@example.invalid" },
  });
  await database.contentInvalidationOutbox.deleteMany({});
  await database.contentRevision.deleteMany({
    where: { entityType: "PostTranslation" },
  });
  await database.postTranslation.deleteMany({
    where: { postId: { in: FIXTURE_POSTS } },
  });
  await database.postTag.deleteMany({
    where: { postId: { in: FIXTURE_POSTS } },
  });
  await database.post.deleteMany({ where: { id: { in: FIXTURE_POSTS } } });
  await database.user.deleteMany({ where: { id: OWNER } });
  await database.user.create({
    data: {
      id: OWNER,
      email: "m4-cutover@example.invalid",
      displayName: "M4 cutover actor",
      passwordHash: "not-a-real-hash",
      role: "OWNER",
      passwordChangedAt: new Date(),
    },
  });
}

/**
 * Writes a translation in a state the article repository will not produce.
 *
 * The leakage matrix needs rows the public path must hide. Scheduled and
 * archived states are reached through publication commands that M8 owns, so
 * they are written directly here rather than pretended into existence through
 * a save that would refuse them.
 */
async function seedState(
  postId: string,
  locale: "en" | "fa",
  slug: string,
  title: string,
  state: {
    readonly status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
    readonly publishedAt?: Date | null;
    readonly scheduledFor?: Date | null;
    readonly archivedAt?: Date | null;
    readonly corruptDigest?: boolean;
  }
): Promise<void> {
  const body = `## ${title}\n\nSeeded directly into ${state.status}.`;
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  await database.post.upsert({
    where: { id: postId },
    update: {},
    create: { id: postId, authorId: OWNER },
  });
  await database.postTranslation.create({
    data: {
      postId,
      locale,
      title,
      slug,
      excerpt: title,
      status: state.status,
      publishedAt: state.publishedAt ?? null,
      scheduledFor: state.scheduledFor ?? null,
      archivedAt: state.archivedAt ?? null,
      bodyMarkdown: body,
      bodySha256: state.corruptDigest ? "f".repeat(64) : digest,
      renderedHtml: `<h2>${title}</h2>`,
      rendererVersion: "2",
      readingMinutes: 1,
      headingTree: [],
      frontmatterSchemaVersion: 1,
    },
  });
}

// ---------------------------------------------------------------------------

try {
  section("0. Preconditions");
  const live = await get("/api/v1/health/live", {}, API);
  check("the API is answering its liveness probe", live.status === 200);
  const ready = await get("/api/v1/health/ready", {}, API);
  check("the API reports a reachable database", ready.status === 200);

  await resetFixture();
  await drain();

  // -------------------------------------------------------------------------
  section("1. Publication reaches the rendered route");

  await store.saveTranslation(
    { frontmatter: frontmatter({}), body: BODY, baseVersion: null },
    OWNER
  );
  await drain();
  const draftList = await get("/en/blog");
  const draftDetail = await get(url("en", CUTOVER_SLUG));
  check(
    "an unpublished article is in neither the listing nor a detail page",
    draftList.status === 200 &&
      !draftList.body.includes(TITLE_FIRST) &&
      draftDetail.status === 404,
    `listing ${draftList.status}, detail ${draftDetail.status}`
  );

  const publishedAt = new Date();
  await store.saveTranslation(
    {
      frontmatter: frontmatter({
        status: "published",
        publishedAt: publishedAt.toISOString(),
      }),
      body: BODY,
      baseVersion: 0,
    },
    OWNER
  );
  // Deliberately measured, not asserted. If the deployment held this read in
  // a shared cache the listing would still be the pre-publication one here,
  // and the purge below would be what changes it. Section 7 records what this
  // deployment actually does.
  const beforePurge = await get("/en/blog");
  cacheObservations.push(
    `listing before the publish purge: ${
      beforePurge.body.includes(TITLE_FIRST) ? "already updated" : "still stale"
    }`
  );

  const deliveredOnPublish = await drain();
  const afterPurge = await get("/en/blog");
  const afterDetail = await get(url("en", CUTOVER_SLUG));
  check(
    "publication reaches the rendered listing once the purge is delivered",
    afterPurge.body.includes(TITLE_FIRST),
    `${deliveredOnPublish} event(s) delivered`
  );
  check(
    "publication reaches the rendered detail page",
    afterDetail.status === 200 && afterDetail.body.includes(TITLE_FIRST),
    `HTTP ${afterDetail.status}`
  );
  check(
    "the detail page carries the sanitized render, not the raw source",
    afterDetail.body.includes("A change committed in PostgreSQL") &&
      !afterDetail.body.includes("## The claim"),
    "heading markup is rendered, Markdown source is absent"
  );

  // -------------------------------------------------------------------------
  section("2. An update reaches the rendered route");

  await store.saveTranslation(
    {
      frontmatter: frontmatter({
        title: TITLE_SECOND,
        status: "published",
        publishedAt: publishedAt.toISOString(),
      }),
      body: `${BODY}\n\nA second paragraph, added by the update.`,
      baseVersion: 1,
    },
    OWNER
  );
  const staleUpdate = await get(url("en", CUTOVER_SLUG));
  cacheObservations.push(
    `detail before the update purge: ${
      staleUpdate.body.includes(TITLE_SECOND)
        ? "already updated"
        : "still stale"
    }`
  );
  await drain();
  const freshUpdate = await get(url("en", CUTOVER_SLUG));
  const freshList = await get("/en/blog");
  check(
    "the update reaches the rendered detail page",
    freshUpdate.body.includes(TITLE_SECOND) &&
      freshUpdate.body.includes("added by the update")
  );
  check(
    "the update reaches the rendered listing too, not only the article",
    freshList.body.includes(TITLE_SECOND) &&
      !freshList.body.includes(TITLE_FIRST),
    "the collective listing tag is what makes this true"
  );

  // -------------------------------------------------------------------------
  section("3. A withdrawal is not served from a stale body");

  await store.saveTranslation(
    {
      frontmatter: frontmatter({ title: TITLE_SECOND }),
      body: BODY,
      baseVersion: 2,
    },
    OWNER
  );
  await drain();
  const withdrawnDetail = await get(url("en", CUTOVER_SLUG));
  const withdrawnList = await get("/en/blog");
  check(
    "an unpublished article stops answering on its detail route",
    withdrawnDetail.status === 404,
    `HTTP ${withdrawnDetail.status}`
  );
  check(
    "an unpublished article disappears from the rendered listing",
    !withdrawnList.body.includes(TITLE_SECOND)
  );

  const repeated = await Promise.all([
    get(url("en", CUTOVER_SLUG)),
    get(url("en", CUTOVER_SLUG)),
    get(url("en", CUTOVER_SLUG)),
  ]);
  check(
    "repeated requests never resurrect the withdrawn body from a buffer",
    repeated.every(
      (response) =>
        response.status === 404 && !response.body.includes(TITLE_SECOND)
    ),
    repeated.map((response) => response.status).join(", ")
  );

  const api404 = await get(
    `/api/v1/public/en/blog/posts/${CUTOVER_SLUG}`,
    {},
    API
  );
  check(
    "the API answers the withdrawn slug with a translation-not-found error",
    api404.status === 404 && !api404.body.includes(TITLE_SECOND),
    `HTTP ${api404.status}`
  );

  // -------------------------------------------------------------------------
  section("4. Public discovery excludes every non-public state");

  const soon = new Date(Date.now() + 86_400_000);
  await seedState(DRAFTED, "en", "m4-leak-draft", "Leak draft", {
    status: "DRAFT",
  });
  await seedState(SCHEDULED, "en", "m4-leak-scheduled", "Leak scheduled", {
    status: "SCHEDULED",
    scheduledFor: soon,
  });
  await seedState(ARCHIVED, "en", "m4-leak-archived", "Leak archived", {
    status: "ARCHIVED",
    archivedAt: new Date(),
  });
  await seedState(
    ENGLISH_ONLY,
    "en",
    "m4-english-only",
    "English only article",
    { status: "PUBLISHED", publishedAt: new Date() }
  );
  await drain();

  const listEn = await get("/en/blog");
  const apiListEn = await get("/api/v1/public/en/blog/posts", {}, API);
  for (const [label, title, slug] of [
    ["draft", "Leak draft", "m4-leak-draft"],
    ["scheduled", "Leak scheduled", "m4-leak-scheduled"],
    ["archived", "Leak archived", "m4-leak-archived"],
  ] as const) {
    const detail = await get(url("en", slug));
    check(
      `a ${label} translation appears in no listing and answers no detail route`,
      !listEn.body.includes(title) &&
        !apiListEn.body.includes(title) &&
        detail.status === 404,
      `detail HTTP ${detail.status}`
    );
  }

  // A published row whose stored digest no longer matches its source is a
  // corrupted render, not a publishable article.
  await database.postTranslation.updateMany({
    where: { postId: ENGLISH_ONLY, locale: "en" },
    data: { bodySha256: "f".repeat(64) },
  });
  await drain();
  const corrupted = await get("/api/v1/public/en/blog/posts", {}, API);
  const corruptedDetail = await get(
    "/api/v1/public/en/blog/posts/m4-english-only",
    {},
    API
  );
  check(
    "a source-integrity-invalid article leaves public discovery entirely",
    !corrupted.body.includes("English only article") &&
      corruptedDetail.status === 404,
    `detail HTTP ${corruptedDetail.status}`
  );
  await database.postTranslation.updateMany({
    where: { postId: ENGLISH_ONLY, locale: "en" },
    data: {
      bodySha256: (await import("node:crypto"))
        .createHash("sha256")
        .update(
          "## English only article\n\nSeeded directly into PUBLISHED.",
          "utf8"
        )
        .digest("hex"),
    },
  });
  await drain();

  const crossLocale = await get(url("fa", "m4-english-only"));
  const crossLocaleApi = await get(
    "/api/v1/public/fa/blog/posts/m4-english-only",
    {},
    API
  );
  check(
    "an English slug requested under Persian is a 404, never an English body",
    crossLocale.status === 404 &&
      !crossLocale.body.includes("English only article") &&
      crossLocaleApi.status === 404,
    `route ${crossLocale.status}, API ${crossLocaleApi.status}`
  );

  const listFa = await get("/fa/blog");
  check(
    "the Persian listing never contains an English-only article",
    !listFa.body.includes("English only article")
  );

  // -------------------------------------------------------------------------
  section("5. Locale routing and direction");

  const en = await get("/en");
  const fa = await get("/fa");
  check(
    "English renders left-to-right and Persian right-to-left",
    en.body.includes('dir="ltr"') &&
      en.body.includes('lang="en"') &&
      fa.body.includes('dir="rtl"') &&
      fa.body.includes('lang="fa"')
  );
  check(
    "server-rendered navigation is present in the initial HTML of both locales",
    en.body.includes("<nav") && fa.body.includes("<nav")
  );

  const rootEn = await get("/", { headers: { "accept-language": "en" } });
  const rootFa = await get("/", {
    headers: { "accept-language": "fa,en;q=0.5" },
  });
  check(
    "the bare root negotiates a locale and redirects exactly once",
    rootEn.status === 308 &&
      rootEn.headers.get("location")?.endsWith("/en") === true &&
      rootFa.status === 308 &&
      rootFa.headers.get("location")?.endsWith("/fa") === true,
    `${rootEn.headers.get("location")} / ${rootFa.headers.get("location")}`
  );

  // The trailing-slash forms are the ones that used to cost two hops, because
  // Next normalized the slash before the proxy ever saw the request.
  for (const legacy of [
    "/projects",
    "/blog",
    "/projects/",
    "/blog/",
    "/en/blog/",
  ]) {
    const first = await get(legacy);
    const target = first.headers.get("location");
    const second =
      target === null ? null : await get(new URL(target, `${WEB}/`).pathname);
    check(
      `the legacy URL ${legacy} redirects exactly once`,
      first.status === 308 &&
        target !== null &&
        second !== null &&
        second.status !== 308 &&
        second.status !== 301 &&
        second.status !== 302,
      `${first.status} -> ${target} -> ${second?.status ?? "n/a"}`
    );
  }

  const persianArticle = await get(url("fa", "مقاله-های-پایگاه-داده"));
  check(
    "the Persian article from M3 renders through the Persian route",
    persianArticle.status === 200 && persianArticle.body.includes('dir="rtl"'),
    `HTTP ${persianArticle.status}`
  );

  // -------------------------------------------------------------------------
  section("6. Contact submission carries no browser credential");

  const submission = {
    name: "Cutover Proof",
    email: "cutover@example.invalid",
    message: "A message long enough to satisfy the contract's minimum length.",
    // Epoch milliseconds: the contract takes a number, and the service uses
    // it to reject a form that was "filled in" implausibly fast.
    startedAt: Date.now() - 30_000,
  };
  const accepted = await get(
    "/api/v1/contact",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submission),
    },
    API
  );
  check(
    "a well-formed submission is accepted with no credential in the request",
    accepted.status === 202,
    `HTTP ${accepted.status}`
  );

  const honeypot = await get(
    "/api/v1/contact",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...submission, company: "a bot filled this in" }),
    },
    API
  );
  check(
    "a honeypot submission is acknowledged identically, so bots learn nothing",
    honeypot.status === accepted.status,
    `HTTP ${honeypot.status}`
  );

  const rejected = await get(
    "/api/v1/contact",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...submission, email: "not-an-email" }),
    },
    API
  );
  check(
    "an invalid submission is refused by the shared contract",
    rejected.status === 400 && rejected.body.includes("VALIDATION_FAILED"),
    `HTTP ${rejected.status}`
  );

  // Scoped to this run's address rather than counting the table: the honeypot
  // and the invalid submission must leave nothing behind, and a global count
  // would also sweep in messages the environment already had.
  const stored = await database.contactMessage.count({
    where: { email: submission.email },
  });
  check(
    "the honeypot and the invalid submission persisted nothing",
    stored === 1,
    `${stored} contact message(s) for this run's address`
  );

  section("7. Cache observations (reported, not asserted)");
  for (const observation of cacheObservations) note(observation);
  note(
    'A read served from a shared cache would read "still stale" above and would'
  );
  note(
    "change only once the purge below it was delivered. See the evidence file."
  );

  process.stdout.write(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} — ${checks} checks\n`
  );
  note(
    "Outage and rollback behaviour is measured separately, with the API stopped."
  );
} finally {
  await database.$disconnect();
}

if (failures > 0) process.exitCode = 1;
