/**
 * M3 exit-gate verification: PostgreSQL is the sole authority for articles.
 *
 * This script exists because the M3 gate cannot be closed by a unit suite.
 * Every assertion below needs a real PostgreSQL server: `CHECK` constraints,
 * partial indexes, three-valued logic, transactional rollback, `FOR UPDATE SKIP
 * LOCKED`, and a digest recomputed by the database rather than by the same
 * Node process that wrote it.
 *
 * It is destructive and refuses to run without `--apply`, in the same style as
 * the other scripts in this directory. It works inside its own fixture
 * namespace and removes it first, so consecutive runs are deterministic.
 *
 * Run it against a database that has every migration applied:
 *
 *   DATABASE_URL=... pnpm --filter @portfolio/database verify:articles
 */

import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";

import {
  articleCacheTags,
  frontmatterSchema,
  normalizeSlug,
  type Frontmatter,
} from "@portfolio/contracts";

import {
  ArticleVersionConflictError,
  createArticleStore,
  enqueueDuePublications,
  publishDueTranslation,
} from "../src/articles.js";
import { createDatabaseClient, type Database } from "../src/client.js";
import {
  createContentJobStore,
  createPrismaSqlExecutor,
} from "../src/content-jobs.js";

if (!process.argv.includes("--apply")) {
  throw new Error(
    "Refusing to run the destructive article verification without --apply."
  );
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

let checks = 0;
let failures = 0;

function section(title: string): void {
  process.stdout.write(`\n## ${title}\n`);
}

function check(label: string, ok: boolean, detail = ""): void {
  checks += 1;
  if (!ok) failures += 1;
  const suffix = detail === "" ? "" : `  — ${detail}`;
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${label}${suffix}\n`);
}

function note(text: string): void {
  process.stdout.write(`      ${text}\n`);
}

async function rejects(run: () => Promise<unknown>): Promise<Error | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

// ---------------------------------------------------------------------------
// Egress seal
//
// "Publication requires neither Git access nor deployment" is only worth
// asserting if something would notice a violation. Every socket except the
// PostgreSQL connection is refused at the runtime level for the publication
// section, so an accidental GitHub or webhook call fails loudly instead of
// succeeding quietly on a machine that happens to have network.
// ---------------------------------------------------------------------------

let sealed = false;
let blockedAttempts = 0;

/**
 * Seals every HTTP client Node exposes. node-postgres builds its own
 * `net.Socket`, so the database connection is deliberately untouched: the
 * claim being proved is that publication needs no *remote service*, not that
 * it needs no socket.
 */
function sealEgress(): void {
  const refuse = (target: string) => {
    blockedAttempts += 1;
    throw new Error(`Egress via ${target} is sealed during publication.`);
  };
  for (const [name, module] of [
    ["http", http],
    ["https", https],
  ] as const) {
    for (const method of ["request", "get"] as const) {
      const real = (module as any)[method].bind(module);
      (module as any)[method] = (...args: unknown[]) =>
        sealed ? refuse(`${name}.${method}`) : real(...args);
    }
  }
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((...args: Parameters<typeof realFetch>) =>
    sealed ? refuse("fetch") : realFetch(...args)) as typeof fetch;
}

sealEgress();

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/** CUID2 shape: one letter then 23 lowercase alphanumerics. */
const id = (seed: string): string => {
  const body = seed
    .replace(/[^a-z0-9]/g, "")
    .padEnd(23, "0")
    .slice(0, 23);
  return `m${body}`;
};

const POST_ID = id("articleauthorityproof");
const COVER_ID = id("coverimageproofasset");
const SOCIAL_ID = id("socialimageproofasset");
const QUARANTINED_ID = id("quarantinedproofasset");
const PRIVATE_ID = id("privateproofassetxxxx");
const OWNER_ID = id("ownerproofactoridxxxx");
const OTHER_POST_ID = id("slugsquatterpostproof");

const CATEGORY_KEY = "m3-proof-engineering";
const TAG_KEYS = ["m3-proof-postgresql", "m3-proof-content"];

const EN_BODY = [
  "## Why one authority",
  "",
  "Two systems owning one document is the defect, not the redundancy.",
  "",
  "- Integer versions detect conflicts.",
  "- Revisions are immutable.",
  "",
  "> A save either lands whole or does not land.",
  "",
  "```ts",
  "const authority = 'postgresql';",
  "```",
  "",
  "See [the decision record](https://example.invalid/adr-015) for the reasoning.",
].join("\n");

/** Bodies the production renderer must refuse or defuse, never store as-is. */
const UNSAFE_BODIES: readonly [string, string][] = [
  ["a raw script element", "## Heading\n\n<script>alert('xss')</script>"],
  ["an inline event handler", '## Heading\n\n<img src="x" onerror="alert(1)">'],
  ["a javascript: link target", "## Heading\n\n[click](javascript:alert(1))"],
  [
    "a data: link target",
    "## Heading\n\n[click](data:text/html,<script>1</script>)",
  ],
];

const FA_BODY = [
  "## چرا یک مرجع",
  "",
  "دو سامانه که یک سند را در اختیار دارند، خودشان نقص هستند.",
  "",
  "- نسخه‌های عددی تعارض را تشخیص می‌دهند.",
  "- بازنگری‌ها تغییرناپذیرند.",
].join("\n");

const database: Database = createDatabaseClient({ connectionString });
const store = createArticleStore(database);
const jobs = createContentJobStore(createPrismaSqlExecutor(database));

const enSlug = normalizeSlug("Database native articles", "en");
const faSlug = normalizeSlug("مقاله های پایگاه داده", "fa");

/**
 * Frontmatter is built through the real contract rather than as a plain
 * object, so a fixture that has drifted from the schema fails here instead of
 * producing a misleading "the store rejected it" result later.
 */
function frontmatter(overrides: Record<string, unknown> = {}): Frontmatter {
  return frontmatterSchema.parse({
    schemaVersion: 1,
    postId: POST_ID,
    locale: "en",
    title: "Database-native articles",
    slug: enSlug,
    excerpt: "PostgreSQL owns the source, the render, and the history.",
    status: "draft",
    category: CATEGORY_KEY,
    tags: TAG_KEYS,
    coverImage: COVER_ID,
    coverImageAlt: "A single database holding one document.",
    socialImage: SOCIAL_ID,
    ...overrides,
  });
}

/** Everything the "changes nothing" assertions compare. */
async function snapshot() {
  const [translations, revisions, outbox, tags, posts, audits] =
    await Promise.all([
      database.postTranslation.findMany({
        where: { postId: POST_ID },
        orderBy: { locale: "asc" },
        select: {
          locale: true,
          version: true,
          status: true,
          slug: true,
          title: true,
          bodyMarkdown: true,
          bodySha256: true,
          renderedHtml: true,
          rendererVersion: true,
          publishedAt: true,
          scheduledFor: true,
        },
      }),
      database.contentRevision.count({
        where: { entityType: "PostTranslation" },
      }),
      database.contentInvalidationOutbox.count(),
      database.postTag.count({ where: { postId: POST_ID } }),
      database.post.count({ where: { id: { in: [POST_ID, OTHER_POST_ID] } } }),
      database.auditEvent.count(),
    ]);
  return {
    translations: JSON.stringify(translations),
    revisions,
    outbox,
    tags,
    posts,
    audits,
  };
}

async function resetFixture(): Promise<void> {
  await database.contentJob.deleteMany({});
  await database.contentInvalidationOutbox.deleteMany({});
  await database.contentRevision.deleteMany({
    where: { entityType: "PostTranslation" },
  });
  await database.auditEvent.deleteMany({
    where: { eventType: { startsWith: "article." } },
  });
  await database.postTranslation.deleteMany({
    where: { postId: { in: [POST_ID, OTHER_POST_ID] } },
  });
  await database.postDraft.deleteMany({ where: { postId: POST_ID } });
  await database.postTag.deleteMany({
    where: { postId: { in: [POST_ID, OTHER_POST_ID] } },
  });
  await database.post.deleteMany({
    where: { id: { in: [POST_ID, OTHER_POST_ID] } },
  });
  await database.mediaAsset.deleteMany({
    where: { id: { in: [COVER_ID, SOCIAL_ID, QUARANTINED_ID, PRIVATE_ID] } },
  });
  await database.tag.deleteMany({ where: { key: { in: TAG_KEYS } } });
  await database.category.deleteMany({ where: { key: CATEGORY_KEY } });
  await database.user.deleteMany({ where: { id: OWNER_ID } });

  await database.user.create({
    data: {
      id: OWNER_ID,
      email: "m3-proof@example.invalid",
      displayName: "M3 proof actor",
      passwordHash: "not-a-real-hash",
      role: "OWNER",
      passwordChangedAt: new Date(),
    },
  });
  await database.category.create({
    data: {
      id: id("categoryproofrecord"),
      key: CATEGORY_KEY,
      translations: {
        create: [
          { locale: "en", name: "Engineering", slug: "m3-proof-engineering" },
          {
            locale: "fa",
            name: "مهندسی",
            slug: normalizeSlug("مهندسی اثبات", "fa"),
          },
        ],
      },
    },
  });
  for (const [index, key] of TAG_KEYS.entries()) {
    await database.tag.create({
      data: {
        id: id(`tagproofrecord${index}`),
        key,
        translations: {
          create: [{ locale: "en", name: key, slug: key }],
        },
      },
    });
  }
  const media = (
    assetId: string,
    name: string,
    extra: Record<string, unknown>
  ) => ({
    id: assetId,
    storageKey: `m3-proof/${name}`,
    displayName: name,
    kind: "IMAGE" as const,
    mimeType: "image/webp",
    byteSize: BigInt(2048),
    checksumSha256: createHash("sha256").update(name).digest("hex"),
    width: 1200,
    height: 630,
    altText: name,
    ...extra,
  });
  await database.mediaAsset.create({
    data: media(COVER_ID, "cover", {
      processingState: "VERIFIED",
      visibility: "PUBLIC",
    }),
  });
  await database.mediaAsset.create({
    data: media(SOCIAL_ID, "social", {
      processingState: "VERIFIED",
      visibility: "PUBLIC",
    }),
  });
  // The database already refuses a PUBLIC quarantined asset, so the two
  // negative cases have to be separated: one unverified, one not public.
  await database.mediaAsset.create({
    data: media(QUARANTINED_ID, "quarantined", {
      processingState: "QUARANTINED",
      visibility: "PRIVATE",
    }),
  });
  await database.mediaAsset.create({
    data: media(PRIVATE_ID, "private", {
      processingState: "VERIFIED",
      visibility: "PRIVATE",
    }),
  });
}

// ---------------------------------------------------------------------------

try {
  section("0. Environment");
  const serverVersion =
    await database.$queryRawUnsafe<{ version: string }[]>("select version()");
  note(serverVersion[0]?.version ?? "unknown server version");
  const applied = await database.$queryRawUnsafe<{ migration_name: string }[]>(
    'select migration_name from "_prisma_migrations" where rolled_back_at is null order by migration_name'
  );
  note(
    `migrations applied: ${applied.map((row) => row.migration_name).join(", ")}`
  );
  const legacyObjects = await database.$queryRawUnsafe<{ name: string }[]>(
    `select table_name as name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('content_sync_logs','content_write_operations','content_apply_ledger','webhook_deliveries')
     union all
     select typname from pg_type
       where typname in ('SyncState','SyncTrigger','SyncOutcome','ContentWriteOperationState')`
  );
  check(
    "no Git synchronization table or type survives the forward migration",
    legacyObjects.length === 0,
    legacyObjects.map((row) => row.name).join(", ")
  );
  const jobKinds = await database.$queryRawUnsafe<{ label: string }[]>(
    `select e.enumlabel as label from pg_type t
       join pg_enum e on e.enumtypid = t.oid
      where t.typname = 'ContentJobKind' order by e.enumsortorder`
  );
  check(
    "ContentJobKind is reduced to publication work only",
    jobKinds.length === 1 && jobKinds[0]?.label === "PUBLISH_DUE",
    jobKinds.map((row) => row.label).join(", ")
  );

  await resetFixture();

  // -------------------------------------------------------------------------
  section("1. Bilingual authoritative Markdown persistence");

  const savedEn = await store.saveTranslation(
    { frontmatter: frontmatter(), body: EN_BODY, baseVersion: null },
    OWNER_ID
  );
  const savedFa = await store.saveTranslation(
    {
      frontmatter: frontmatter({
        locale: "fa",
        title: "مقاله‌های پایگاه‌داده‌محور",
        slug: faSlug,
        excerpt: "پایگاه داده مالک متن، رندر و تاریخچه است.",
        coverImageAlt: "یک پایگاه داده که یک سند را نگه می‌دارد.",
      }),
      body: FA_BODY,
      baseVersion: null,
    },
    OWNER_ID
  );
  check(
    "one post carries an independent English and Persian translation",
    savedEn.postId === POST_ID &&
      savedFa.postId === POST_ID &&
      savedEn.id !== savedFa.id,
    `en=${savedEn.id} fa=${savedFa.id}`
  );

  const stored = await database.postTranslation.findMany({
    where: { postId: POST_ID },
    orderBy: { locale: "asc" },
  });
  check(
    "PostgreSQL holds the complete Markdown source for both locales",
    stored.length === 2 &&
      stored.every((row) => (row.bodyMarkdown ?? "").length > 0) &&
      stored.find((row) => row.locale === "en")?.bodyMarkdown ===
        EN_BODY.trim() &&
      stored.find((row) => row.locale === "fa")?.bodyMarkdown ===
        FA_BODY.trim(),
    `${stored.map((row) => `${row.locale}:${row.bodyMarkdown?.length}B`).join(" ")}`
  );

  // The digest is recomputed by PostgreSQL, not by this process. A digest the
  // writer also verifies proves only that the writer is self-consistent.
  const digests = await database.$queryRawUnsafe<
    { locale: string; stored: string; recomputed: string }[]
  >(
    `select "locale", "bodySha256" as stored,
            encode(sha256(convert_to("bodyMarkdown", 'UTF8')), 'hex') as recomputed
       from "post_translations" where "postId" = $1 order by "locale"`,
    POST_ID
  );
  check(
    "every stored digest matches one PostgreSQL recomputes from the source",
    digests.length === 2 &&
      digests.every((row) => row.stored === row.recomputed),
    digests.map((row) => `${row.locale}:${row.stored.slice(0, 12)}…`).join(" ")
  );

  const en = stored.find((row) => row.locale === "en")!;
  check(
    "the render cache carries its renderer provenance and reading metadata",
    en.rendererVersion !== null &&
      en.renderedHtml !== null &&
      (en.readingMinutes ?? 0) > 0 &&
      Array.isArray(en.headingTree) &&
      (en.headingTree as unknown[]).length > 0,
    `renderer=${en.rendererVersion} minutes=${en.readingMinutes} headings=${(en.headingTree as unknown[]).length}`
  );
  const html = en.renderedHtml ?? "";
  check(
    "the cached render is the sanitized production render, not the raw source",
    !html.includes("<script") &&
      !html.includes("onerror") &&
      !html.toLowerCase().includes("javascript:") &&
      html.includes("<blockquote") &&
      html.includes("<li"),
    `${html.length} bytes`
  );
  check(
    "editorial metadata and taxonomy landed with the source",
    en.title === "Database-native articles" &&
      en.slug === enSlug &&
      en.frontmatterSchemaVersion === 1 &&
      (await database.postTag.count({ where: { postId: POST_ID } })) ===
        TAG_KEYS.length,
    `slug=${en.slug}`
  );

  const created = await database.contentRevision.findMany({
    where: { entityType: "PostTranslation" },
    orderBy: { createdAt: "asc" },
  });
  check(
    "each first save wrote exactly one CREATE revision at version 0",
    created.length === 2 &&
      created.every(
        (row) => row.action === "CREATE" && row.entityVersion === 0
      ),
    `${created.length} revisions`
  );
  check(
    "each save queued exactly one locale-scoped invalidation event",
    (await database.contentInvalidationOutbox.count()) === 2 &&
      (await database.contentInvalidationOutbox.count({
        where: {
          cacheTag: articleCacheTags({ locale: "en", slug: enSlug })[0]!,
        },
      })) === 1
  );

  // -------------------------------------------------------------------------
  section("2. Immutable revisions across an update");

  const firstRevision = created.find((row) => row.entityId === savedEn.id)!;
  const updated = await store.saveTranslation(
    {
      frontmatter: frontmatter({ title: "Database-native articles, revised" }),
      body: `${EN_BODY}\n\nA second paragraph, added by the second save.`,
      baseVersion: 0,
    },
    OWNER_ID
  );
  check(
    "an accepted save advances the integer version",
    updated.version === 1,
    `version=${updated.version}`
  );
  const afterUpdate = await database.contentRevision.findMany({
    where: { entityType: "PostTranslation", entityId: savedEn.id },
    orderBy: { entityVersion: "asc" },
  });
  check(
    "the update appended an UPDATE revision instead of rewriting history",
    afterUpdate.length === 2 &&
      afterUpdate[0]?.action === "CREATE" &&
      afterUpdate[1]?.action === "UPDATE" &&
      afterUpdate[1]?.entityVersion === 1
  );
  const reread = await database.contentRevision.findUnique({
    where: { id: firstRevision.id },
  });
  check(
    "the earlier revision still holds the source it was written with",
    JSON.stringify(reread?.after) === JSON.stringify(firstRevision.after) &&
      reread?.createdAt.getTime() === firstRevision.createdAt.getTime()
  );
  const duplicate = await rejects(() =>
    database.contentRevision.create({
      data: {
        entityType: "PostTranslation",
        entityId: savedEn.id,
        entityVersion: 1,
        action: "UPDATE",
      },
    })
  );
  check(
    "PostgreSQL refuses a second revision for the same entity version",
    duplicate !== null,
    duplicate?.message.split("\n")[0]
  );

  // -------------------------------------------------------------------------
  section("3. A rejected save changes nothing");

  const beforeStale = await snapshot();
  const staleError = await rejects(() =>
    store.saveTranslation(
      {
        frontmatter: frontmatter({ title: "Written from a stale editor" }),
        body: EN_BODY,
        baseVersion: 0,
      },
      OWNER_ID
    )
  );
  check(
    "a stale integer version is refused as a conflict",
    staleError instanceof ArticleVersionConflictError &&
      staleError.expectedVersion === 0 &&
      staleError.currentVersion === 1,
    staleError?.message
  );
  check(
    "the stale save left article, revision, outbox, and audit state untouched",
    JSON.stringify(await snapshot()) === JSON.stringify(beforeStale)
  );

  const unknownTag = await rejects(() =>
    store.saveTranslation(
      {
        frontmatter: frontmatter({
          tags: [...TAG_KEYS, "m3-proof-nonexistent"],
        }),
        body: EN_BODY,
        baseVersion: 1,
      },
      OWNER_ID
    )
  );
  check(
    "an unknown tag reference is refused",
    unknownTag !== null && unknownTag.message.includes("m3-proof-nonexistent"),
    unknownTag?.message
  );
  const quarantined = await rejects(() =>
    store.saveTranslation(
      {
        frontmatter: frontmatter({ coverImage: QUARANTINED_ID }),
        body: EN_BODY,
        baseVersion: 1,
      },
      OWNER_ID
    )
  );
  check(
    "a quarantined media reference is refused rather than published",
    quarantined !== null && quarantined.message.includes("media"),
    quarantined?.message
  );
  const privateMedia = await rejects(() =>
    store.saveTranslation(
      {
        frontmatter: frontmatter({ socialImage: PRIVATE_ID }),
        body: EN_BODY,
        baseVersion: 1,
      },
      OWNER_ID
    )
  );
  check(
    "a private media reference is refused rather than leaked onto a public page",
    privateMedia !== null && privateMedia.message.includes("media"),
    privateMedia?.message
  );
  const emptyBody = await rejects(() =>
    store.saveTranslation(
      { frontmatter: frontmatter(), body: "   \n\n   ", baseVersion: 1 },
      OWNER_ID
    )
  );
  check(
    "a body with no readable Markdown is refused",
    emptyBody !== null,
    emptyBody?.message
  );
  for (const [label, unsafe] of UNSAFE_BODIES) {
    const outcome = await rejects(() =>
      store.saveTranslation(
        { frontmatter: frontmatter(), body: unsafe, baseVersion: 1 },
        OWNER_ID
      )
    );
    let defused = outcome !== null;
    if (!defused) {
      const row = await database.postTranslation.findUniqueOrThrow({
        where: { id: savedEn.id },
      });
      const rendered = (row.renderedHtml ?? "").toLowerCase();
      defused =
        !rendered.includes("<script") &&
        !rendered.includes("onerror") &&
        !rendered.includes("javascript:") &&
        !rendered.includes("data:text/html");
    }
    check(
      `${label} is refused or defused before it can be stored`,
      defused,
      outcome === null ? "accepted but sanitized" : "refused"
    );
  }

  check(
    "none of the invalid saves changed any article, revision, or outbox row",
    JSON.stringify(await snapshot()) === JSON.stringify(beforeStale)
  );

  // -------------------------------------------------------------------------
  section("4. A forced transaction failure rolls everything back");

  // (a) A real mid-transaction constraint violation. The slug is already held
  //     by another post, so `post.upsert` and the tag writes land first and the
  //     translation insert is what fails.
  await database.post.create({ data: { id: OTHER_POST_ID } });
  await database.postTranslation.create({
    data: {
      postId: OTHER_POST_ID,
      locale: "en",
      title: "Squatting on the slug",
      slug: "m3-proof-contested-slug",
      status: "DRAFT",
      bodyMarkdown: "# held",
      bodySha256: createHash("sha256").update("# held").digest("hex"),
    },
  });
  const beforeCollision = await snapshot();
  const collision = await rejects(() =>
    store.saveTranslation(
      {
        frontmatter: frontmatter({
          title: "Contested slug",
          slug: "m3-proof-contested-slug",
          // A different tag set, so the transaction has already rewritten
          // related rows by the time the translation insert fails.
          tags: [TAG_KEYS[0]!],
        }),
        body: EN_BODY,
        baseVersion: 1,
      },
      OWNER_ID
    )
  );
  check(
    "a unique-constraint violation mid-transaction aborts the save",
    collision !== null,
    collision?.message.split("\n").find((line) => line.trim().length > 0)
  );
  const afterCollision = await snapshot();
  check(
    "the tag rows the aborted transaction had already rewritten were restored",
    afterCollision.tags === TAG_KEYS.length,
    `${afterCollision.tags} rows`
  );
  check(
    "no partial article, revision, audit, or invalidation row survived",
    JSON.stringify(afterCollision) === JSON.stringify(beforeCollision)
  );

  // (b) An injected failure after every write in the transaction has succeeded.
  //     This is the case a constraint cannot produce: everything committed
  //     logically, then the unit of work failed.
  const beforeInjected = await snapshot();
  const failing = {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      database.$transaction(async (tx: any) =>
        run(
          new Proxy(tx, {
            get(target, property) {
              if (property === "contentInvalidationOutbox") {
                const delegate = Reflect.get(target, property);
                return new Proxy(delegate, {
                  get(inner, innerProperty) {
                    if (innerProperty !== "create")
                      return Reflect.get(inner, innerProperty);
                    return async (args: unknown) => {
                      await (inner as any).create(args);
                      throw new Error(
                        "injected failure after every write succeeded"
                      );
                    };
                  },
                });
              }
              const value = Reflect.get(target, property);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
        )
      ),
  } as unknown as Database;
  const injected = await rejects(() =>
    createArticleStore(failing).saveTranslation(
      {
        frontmatter: frontmatter({ title: "Rolled back after every write" }),
        body: `${EN_BODY}\n\nThis text must not exist anywhere afterwards.`,
        baseVersion: 1,
      },
      OWNER_ID
    )
  );
  check(
    "the injected post-write failure propagates",
    injected !== null && injected.message.includes("injected failure"),
    injected?.message
  );
  check(
    "source, render, revision, audit, and invalidation state are unchanged",
    JSON.stringify(await snapshot()) === JSON.stringify(beforeInjected)
  );
  check(
    "no trace of the rolled-back body is searchable in the source column",
    (await database.postTranslation.count({
      where: { bodyMarkdown: { contains: "must not exist anywhere" } },
    })) === 0
  );

  // -------------------------------------------------------------------------
  section("5. Legacy rows without recoverable source fail closed");

  const forcedPublish = await rejects(() =>
    database.$executeRawUnsafe(
      `INSERT INTO "post_translations" ("id","postId","locale","title","slug","status","publishedAt","updatedAt")
       VALUES ($1,$2,'fa','Legacy index row','m3-proof-legacy-row','PUBLISHED', now(), now())`,
      id("legacyindexproofrow"),
      OTHER_POST_ID
    )
  );
  check(
    "PostgreSQL refuses a PUBLISHED translation with no Markdown source",
    forcedPublish !== null &&
      forcedPublish.message.includes("post_translations_published_has_source"),
    forcedPublish?.message.split("\n")[0]
  );
  await database.$executeRawUnsafe(
    `INSERT INTO "post_translations" ("id","postId","locale","title","slug","status","updatedAt")
     VALUES ($1,$2,'fa','Legacy index row','m3-proof-legacy-row','DRAFT', now())`,
    id("legacyindexproofrow"),
    OTHER_POST_ID
  );
  const listed = await database.$queryRawUnsafe<{ count: bigint }[]>(
    `select count(*) as count from "post_translations"
      where "status" = 'PUBLISHED' and "bodyMarkdown" is not null
        and "bodySha256" is not null and "archivedAt" is null
        and "slug" = 'm3-proof-legacy-row'`
  );
  check(
    "a sourceless legacy row is invisible to the public listing predicate",
    Number(listed[0]?.count ?? 0) === 0
  );

  // -------------------------------------------------------------------------
  section("6. Scheduled publication is database-native and idempotent");

  const dueAt = new Date(Date.now() + 1_500);
  const scheduled = await store.saveTranslation(
    {
      frontmatter: frontmatter({
        status: "scheduled",
        scheduledFor: dueAt.toISOString(),
      }),
      body: EN_BODY,
      baseVersion: 1,
    },
    OWNER_ID
  );
  check(
    "scheduling is realized state in PostgreSQL, not a file annotation",
    scheduled.version === 2 &&
      (await database.postTranslation.count({
        where: { id: savedEn.id, status: "SCHEDULED", scheduledFor: dueAt },
      })) === 1
  );

  check(
    "nothing is queued before the scheduled time",
    (await enqueueDuePublications(
      database,
      jobs,
      new Date(Date.now() - 1_000)
    )) === 0
  );
  await new Promise((resolve) => setTimeout(resolve, 1_800));

  sealed = true;
  const queued = await enqueueDuePublications(database, jobs);
  const requeued = await enqueueDuePublications(database, jobs);
  check(
    "a due translation is enqueued once and deduplicated on the next tick",
    queued === 1 && requeued === 0,
    `queued=${queued} requeued=${requeued}`
  );

  const job = await jobs.claim({ worker: "verify@proof", leaseSeconds: 60 });
  check(
    "the scheduler claims the publication job under FOR UPDATE SKIP LOCKED",
    job !== null && job.kind === "PUBLISH_DUE",
    job === null ? "no job claimed" : `attempts=${job.attempts}`
  );
  const contended = await jobs.claim({
    worker: "second@proof",
    leaseSeconds: 60,
  });
  check(
    "a second worker cannot claim the same job while the lease holds",
    contended === null
  );

  const published = await publishDueTranslation(database, savedEn.id);
  const republished = await publishDueTranslation(database, savedEn.id);
  await jobs.succeed(job!.id);
  sealed = false;
  check(
    "publication succeeds once and is a no-op when replayed",
    published === "published" && republished === "skipped",
    `${published} then ${republished}`
  );
  check(
    "publication completed with every socket except PostgreSQL sealed",
    blockedAttempts === 0,
    `${blockedAttempts} blocked egress attempts`
  );

  const live = await database.postTranslation.findUniqueOrThrow({
    where: { id: savedEn.id },
  });
  check(
    "the published row satisfies the source-integrity constraint",
    live.status === "PUBLISHED" &&
      live.publishedAt !== null &&
      live.scheduledFor === null &&
      live.version === 3 &&
      createHash("sha256").update(live.bodyMarkdown!, "utf8").digest("hex") ===
        live.bodySha256,
    `version=${live.version} publishedAt=${live.publishedAt?.toISOString()}`
  );
  check(
    "publication appended its own revision and invalidation event",
    (await database.contentRevision.count({
      where: { entityId: savedEn.id, entityVersion: 3 },
    })) === 1 &&
      Number(
        (
          await database.$queryRawUnsafe<{ count: bigint }[]>(
            `select count(*) as count from "content_invalidation_outbox"
              where "cacheTag" = $1 and "payload"->>'reason' = 'publish'`,
            articleCacheTags({ locale: "en", slug: enSlug })[0]!
          )
        )[0]?.count ?? 0
      ) >= 1
  );

  // -------------------------------------------------------------------------
  section("7. A real bilingual article is live in PostgreSQL");

  const now = new Date();
  await store.saveTranslation(
    {
      frontmatter: frontmatter({
        locale: "fa",
        title: "مقاله‌های پایگاه‌داده‌محور",
        slug: faSlug,
        excerpt: "پایگاه داده مالک متن، رندر و تاریخچه است.",
        coverImageAlt: "یک پایگاه داده که یک سند را نگه می‌دارد.",
        status: "published",
        publishedAt: now.toISOString(),
      }),
      body: FA_BODY,
      baseVersion: 0,
    },
    OWNER_ID
  );
  const bilingual = await database.postTranslation.findMany({
    where: { postId: POST_ID, status: "PUBLISHED" },
    orderBy: { locale: "asc" },
    select: {
      locale: true,
      slug: true,
      title: true,
      version: true,
      bodySha256: true,
      rendererVersion: true,
      readingMinutes: true,
      publishedAt: true,
    },
  });
  check(
    "both locales are published, independently versioned, and render-bound",
    bilingual.length === 2 &&
      bilingual.every(
        (row) => row.rendererVersion !== null && row.publishedAt !== null
      ) &&
      bilingual[0]?.slug !== bilingual[1]?.slug
  );
  for (const row of bilingual) {
    note(
      `${row.locale}  v${row.version}  ${row.slug}  sha=${row.bodySha256?.slice(0, 12)}…  renderer=${row.rendererVersion}  ${row.readingMinutes} min`
    );
  }

  const finalDigests = await database.$queryRawUnsafe<{ mismatched: bigint }[]>(
    `select count(*) as mismatched from "post_translations"
      where "bodyMarkdown" is not null
        and "bodySha256" <> encode(sha256(convert_to("bodyMarkdown", 'UTF8')), 'hex')`
  );
  check(
    "no row in the database carries a digest that disagrees with its source",
    Number(finalDigests[0]?.mismatched ?? 0) === 0
  );

  process.stdout.write(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} — ${checks} checks\n`
  );
} finally {
  await database.$disconnect();
}

if (failures > 0) process.exitCode = 1;
