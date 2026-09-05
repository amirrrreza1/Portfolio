import { createHash } from "node:crypto";

import { createDatabaseClient } from "@portfolio/database";
import { renderArticleBody } from "@portfolio/markdown";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const apply = process.argv.includes("--apply");
const database = createDatabaseClient({ connectionString: databaseUrl });
const failures: Array<{ id: string; reason: string }> = [];
let changed = 0;
let unchanged = 0;

try {
  const translations = await database.postTranslation.findMany({
    where: { bodyMarkdown: { not: null } },
    select: {
      id: true,
      version: true,
      bodyMarkdown: true,
      bodySha256: true,
      renderedHtml: true,
      rendererVersion: true,
      readingMinutes: true,
      headingTree: true,
    },
    orderBy: { id: "asc" },
  });

  for (const translation of translations) {
    const source = translation.bodyMarkdown;
    if (source === null) continue;
    const digest = createHash("sha256").update(source).digest("hex");
    if (translation.bodySha256 !== digest) {
      failures.push({ id: translation.id, reason: "source-digest" });
      continue;
    }

    try {
      const rendered = await renderArticleBody(source);
      const nextHeadings = JSON.stringify(rendered.headings);
      const currentHeadings = JSON.stringify(translation.headingTree);
      if (
        translation.renderedHtml === rendered.html &&
        translation.rendererVersion === rendered.rendererVersion &&
        translation.readingMinutes === rendered.readingTimeMinutes &&
        currentHeadings === nextHeadings
      ) {
        unchanged += 1;
        continue;
      }

      if (apply) {
        const updated = await database.postTranslation.updateMany({
          where: {
            id: translation.id,
            version: translation.version,
            bodySha256: digest,
          },
          data: {
            renderedHtml: rendered.html,
            rendererVersion: rendered.rendererVersion,
            readingMinutes: rendered.readingTimeMinutes,
            headingTree: rendered.headings.map(({ depth, id, text }) => ({
              depth,
              id,
              text,
            })),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          failures.push({ id: translation.id, reason: "concurrent-update" });
          continue;
        }
      }
      changed += 1;
    } catch {
      failures.push({ id: translation.id, reason: "render-failed" });
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: apply ? "apply" : "plan",
        checked: translations.length,
        changed,
        unchanged,
        failures,
        status: failures.length === 0 ? "ok" : "failed",
      },
      null,
      2
    )}\n`
  );
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await database.$disconnect();
}
