import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Proves the integrity constraints actually reject what they claim to reject.
 *
 * The DDL is not hand-written here — it comes from
 * `prisma migrate diff --from-empty`, so the constraints are always verified
 * against the schema Prisma really generates. A hand-maintained copy would
 * drift from the schema and then quietly test the wrong shape, which is worse
 * than not testing at all.
 *
 * PGlite is a real PostgreSQL compiled to WebAssembly, so `CHECK`, partial
 * unique indexes, and three-valued logic all behave exactly as they will in
 * production. It needs no database server, which is what lets this run in CI
 * before the M9 container work exists.
 *
 * Two of these assertions exist because the constraints originally failed them.
 * SQL's three-valued logic means a `CHECK` that evaluates to NULL *passes*, and
 * both `("width" > 0 AND "height" > 0)` with a NULL height and
 * `array_length(empty_array, 1) >= 1` evaluate to NULL rather than false.
 */

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

let db: PGlite;

/** Runs a statement and reports whether PostgreSQL accepted it. */
async function accepts(statement: string): Promise<boolean> {
  try {
    await db.exec(statement);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  // Prisma's own DDL for the current schema, generated without a database.
  const ddl = execFileSync(
    "node",
    [
      path.join(packageRoot, "node_modules/prisma/build/index.js"),
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      path.join(packageRoot, "prisma/schema.prisma"),
      "--script",
    ],
    { encoding: "utf8", cwd: packageRoot }
  );

  const constraints = readFileSync(
    path.join(packageRoot, "prisma/sql/integrity_constraints.sql"),
    "utf8"
  );

  db = new PGlite();
  await db.exec(ddl);

  // Comment lines are stripped before splitting: a semicolon inside prose
  // would otherwise cut a statement in half.
  const sql = constraints
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  for (const statement of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await db.exec(`${statement};`);
  }

  await db.exec(`INSERT INTO "posts" (id, "updatedAt") VALUES ('p1', now());`);
  await db.exec(
    `INSERT INTO "media_assets" (id, "storageKey", "displayName", kind, "mimeType", "byteSize", "checksumSha256", "updatedAt")
     VALUES ('m1', 'k1', 'r.pdf', 'DOCUMENT', 'application/pdf', 100, repeat('a', 64), now());`
  );
  await db.exec(
    `INSERT INTO "skill_categories" (id, key, "updatedAt") VALUES ('sc1', 'languages', now());`
  );
}, 120_000);

beforeEach(async () => {
  await db.exec('DELETE FROM "post_translations";');
});

function translation(id: string, columns: Record<string, string>): string {
  const names = Object.keys(columns)
    .map((c) => `"${c}"`)
    .join(", ");
  const values = Object.values(columns).join(", ");
  return `INSERT INTO "post_translations" (id, "postId", locale, title, slug, "updatedAt"${names ? `, ${names}` : ""})
          VALUES ('${id}', 'p1', 'en', 'T', '${id}', now()${values ? `, ${values}` : ""});`;
}

describe("publication state invariants", () => {
  it("rejects PUBLISHED without publishedAt", async () => {
    expect(
      await accepts(
        translation("a", {
          status: "'PUBLISHED'",
          bodyMarkdown: "'## Body'",
          bodySha256: "repeat('a', 64)",
        })
      )
    ).toBe(false);
  });

  it("accepts PUBLISHED with publishedAt and a authoritative Markdown source", async () => {
    expect(
      await accepts(
        translation("b", {
          status: "'PUBLISHED'",
          publishedAt: "now()",
          bodyMarkdown: "'## Body'",
          bodySha256: "repeat('a', 64)",
        })
      )
    ).toBe(true);
  });

  it("rejects PUBLISHED with no authoritative Markdown", async () => {
    // The split-brain state M3 exists to prevent: an index row claiming to be
    // published with no file behind it.
    expect(
      await accepts(
        translation("c", { status: "'PUBLISHED'", publishedAt: "now()" })
      )
    ).toBe(false);
  });

  it("rejects SCHEDULED that already has publishedAt", async () => {
    expect(
      await accepts(
        translation("d", {
          status: "'SCHEDULED'",
          scheduledFor: "now()",
          publishedAt: "now()",
        })
      )
    ).toBe(false);
  });

  it("rejects DRAFT carrying a publishedAt", async () => {
    expect(
      await accepts(
        translation("f", { status: "'DRAFT'", publishedAt: "now()" })
      )
    ).toBe(false);
  });

  it("rejects a render cache with no provenance", async () => {
    expect(
      await accepts(
        translation("g", {
          renderedHtml: "'<p>x</p>'",
          bodyMarkdown: "'## Body'",
          bodySha256: "repeat('a', 64)",
        })
      )
    ).toBe(false);
  });

  it("accepts a render cache with both source digest and renderer version", async () => {
    expect(
      await accepts(
        translation("h", {
          renderedHtml: "'<p>x</p>'",
          bodyMarkdown: "'## Body'",
          bodySha256: "repeat('a', 64)",
          rendererVersion: "'1'",
        })
      )
    ).toBe(true);
  });
});

describe("resume activation", () => {
  const insert = (id: string, activated: string, retired = "NULL") =>
    `INSERT INTO "resume_versions" (id, "mediaAssetId", label, "activatedAt", "retiredAt", "updatedAt")
     VALUES ('${id}', 'm1', '${id}', ${activated}, ${retired}, now());`;

  it("allows exactly one active version at a time", async () => {
    expect(await accepts(insert("r1", "now()"))).toBe(true);
    expect(await accepts(insert("r2", "now()"))).toBe(false);
  });

  it("allows a replacement once the previous one is retired", async () => {
    await db.exec(
      `UPDATE "resume_versions" SET "retiredAt" = now() WHERE id = 'r1';`
    );
    expect(await accepts(insert("r3", "now()"))).toBe(true);
  });

  it("rejects a version retired before it was activated", async () => {
    expect(
      await accepts(insert("r4", "now()", "now() - interval '1 day'"))
    ).toBe(false);
  });
});

describe("media integrity", () => {
  const media = (id: string, columns: string, values: string) =>
    `INSERT INTO "media_assets" (id, "storageKey", "displayName", kind, "mimeType", "byteSize", "checksumSha256", "updatedAt"${columns})
     VALUES ('${id}', 'k${id}', 'a.png', 'IMAGE', 'image/png', 10, repeat('a', 64), now()${values});`;

  it("rejects a zero byte size", async () => {
    expect(
      await accepts(
        `INSERT INTO "media_assets" (id, "storageKey", "displayName", kind, "mimeType", "byteSize", "checksumSha256", "updatedAt")
         VALUES ('mz', 'kz', 'a.png', 'IMAGE', 'image/png', 0, repeat('a', 64), now());`
      )
    ).toBe(false);
  });

  it("rejects an uppercase checksum so comparison never has to normalize", async () => {
    expect(
      await accepts(
        `INSERT INTO "media_assets" (id, "storageKey", "displayName", kind, "mimeType", "byteSize", "checksumSha256", "updatedAt")
         VALUES ('mu', 'ku', 'a.png', 'IMAGE', 'image/png', 10, repeat('A', 64), now());`
      )
    ).toBe(false);
  });

  it("rejects a half-populated dimension pair", async () => {
    // The three-valued-logic case. (100 > 0 AND NULL > 0) is NULL, and a CHECK
    // that evaluates to NULL passes, so this needs explicit IS NOT NULL guards.
    expect(await accepts(media("m7", ", width", ", 100"))).toBe(false);
  });

  it("accepts both dimensions or neither", async () => {
    expect(await accepts(media("m8", ", width, height", ", 100, 50"))).toBe(
      true
    );
    expect(await accepts(media("m9", "", ""))).toBe(true);
  });

  it("refuses to make a quarantined object public", async () => {
    expect(
      await accepts(
        media(
          "mq",
          ', "processingState", "visibility"',
          ", 'QUARANTINED', 'PUBLIC'"
        )
      )
    ).toBe(false);
    expect(
      await accepts(
        media(
          "mp",
          ', "processingState", "visibility"',
          ", 'QUARANTINED', 'PRIVATE'"
        )
      )
    ).toBe(true);
  });
});

describe("colour format", () => {
  const skill = (id: string, name: string, color: string) =>
    `INSERT INTO "skills" (id, "categoryId", name, color, "updatedAt")
     VALUES ('${id}', 'sc1', '${name}', '${color}', now());`;

  it("accepts lowercase six-digit hex", async () => {
    expect(await accepts(skill("s1", "TypeScript", "#3178c6"))).toBe(true);
  });

  it.each([
    ["#fff", "three-digit shorthand"],
    ["#3178C6", "uppercase"],
    ["red", "named colour"],
  ])("rejects %s (%s)", async (color) => {
    expect(await accepts(skill(`s-${color}`, "X", color))).toBe(false);
  });

  it("accepts the legacy #000000 so migration can report it rather than fail", async () => {
    // Three legacy skill colours are pure black and fail contrast. They are
    // valid hex; flagging them is the contrast checker's job, not this
    // constraint's.
    expect(await accepts(skill("s4", "Z", "#000000"))).toBe(true);
  });
});

describe("link safety", () => {
  const social = (id: string, url: string, kind: string) =>
    `INSERT INTO "social_links" (id, "labelByLocale", url, kind, "updatedAt")
     VALUES ('${id}', '{}', '${url}', '${kind}', now());`;

  const nav = (id: string, kind: string, target: string) =>
    `INSERT INTO "nav_items" (id, "labelByLocale", "targetKind", target, "updatedAt")
     VALUES ('${id}', '{}', '${kind}', '${target}', now());`;

  it("permits mailto only for EMAIL links", async () => {
    expect(await accepts(social("l1", "mailto:a@b.com", "SOCIAL"))).toBe(false);
    expect(await accepts(social("l2", "mailto:a@b.com", "EMAIL"))).toBe(true);
  });

  it("requires https for every other kind", async () => {
    expect(await accepts(social("l3", "http://x.com", "SOCIAL"))).toBe(false);
  });

  it("rejects a protocol-relative nav target", async () => {
    // A browser treats //host as absolute, so this would turn the header into
    // an off-site redirect surface.
    expect(await accepts(nav("n1", "INTERNAL_ROUTE", "//evil.example"))).toBe(
      false
    );
  });

  it("rejects traversal in a nav target", async () => {
    expect(await accepts(nav("n2", "INTERNAL_ROUTE", "/a/../b"))).toBe(false);
  });

  it("accepts a site-relative nav target", async () => {
    expect(await accepts(nav("n3", "INTERNAL_ROUTE", "/projects"))).toBe(true);
  });

  it('rejects the legacy "#" placeholder as a project link', async () => {
    expect(
      await accepts(
        `INSERT INTO "projects" (id, slug, status, "demoUrl", "updatedAt")
         VALUES ('pr1', 'portfolio', 'COMPLETED', '#', now());`
      )
    ).toBe(false);
  });
});

describe("redirects", () => {
  const redirect = (id: string, from: string, to: string, code = 308) =>
    `INSERT INTO "slug_redirects" (id, locale, "fromPath", "toPath", "statusCode")
     VALUES ('${id}', 'en', '${from}', '${to}', ${code});`;

  it("permits only 301 and 308", async () => {
    expect(await accepts(redirect("sr1", "/a", "/b", 302))).toBe(false);
    expect(await accepts(redirect("sr2", "/a", "/b", 308))).toBe(true);
    expect(await accepts(redirect("sr5", "/c", "/d", 301))).toBe(true);
  });

  it("rejects a redirect to itself", async () => {
    expect(await accepts(redirect("sr3", "/x", "/x"))).toBe(false);
  });
});

describe("singletons and empty allowlists", () => {
  it("permits exactly one settings row", async () => {
    const insert = (id: number) =>
      `INSERT INTO "site_settings" (id, "canonicalSiteUrl", "authorName", "creatorName", "publisherName", "contactRecipientEmail", "updatedAt")
       VALUES (${id}, 'https://x.com', 'A', 'A', 'A', 'a@b.com', now());`;

    expect(await accepts(insert(1))).toBe(true);
    expect(await accepts(insert(2))).toBe(false);
  });

  it("rejects a default locale outside the enabled set", async () => {
    expect(
      await accepts(
        `UPDATE "site_settings" SET "enabledLocales" = ARRAY['fa']::"Locale"[] WHERE id = 1;`
      )
    ).toBe(false);
  });

  it("rejects an empty locale allowlist", async () => {
    // array_length returns NULL for an empty array, not 0, so `>= 1` is NULL
    // and passes without coalesce. This is the assertion that caught it.
    expect(
      await accepts(
        `UPDATE "site_settings" SET "enabledLocales" = ARRAY[]::"Locale"[] WHERE id = 1;`
      )
    ).toBe(false);
  });

  it("rejects disabling every theme or blog font", async () => {
    await db.exec(
      `INSERT INTO "appearance_settings" (id, "enabledThemes", "defaultTheme", "enabledBlogFonts", "defaultBlogFontByLocale", "allowedBlogSizeSteps", "defaultBlogSizeStep", "updatedAt")
       VALUES (1, ARRAY['dark'], 'dark', ARRAY['vazir-code'], '{}', ARRAY['md'], 'md', now());`
    );

    expect(
      await accepts(
        `UPDATE "appearance_settings" SET "enabledThemes" = ARRAY[]::TEXT[] WHERE id = 1;`
      )
    ).toBe(false);
    expect(
      await accepts(
        `UPDATE "appearance_settings" SET "enabledBlogFonts" = ARRAY[]::TEXT[] WHERE id = 1;`
      )
    ).toBe(false);
  });
});

describe("contact retention", () => {
  it("rejects a deletion date before creation", async () => {
    expect(
      await accepts(
        `INSERT INTO "contact_messages" (id, name, email, message, "deletionDueAt")
         VALUES ('c1', 'a', 'a@b.com', 'hi', now() - interval '1 day');`
      )
    ).toBe(false);
  });

  it("rejects SENT with no delivery timestamp", async () => {
    expect(
      await accepts(
        `INSERT INTO "contact_messages" (id, name, email, message, "deliveryStatus", "deletionDueAt")
         VALUES ('c2', 'a', 'a@b.com', 'hi', 'SENT', now() + interval '90 days');`
      )
    ).toBe(false);
  });
});
