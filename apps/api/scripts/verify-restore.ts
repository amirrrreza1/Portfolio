import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createDatabaseClient } from "@portfolio/database";
import { renderArticleBody } from "@portfolio/markdown";

import { parseApiEnvironment } from "../src/config/environment.js";

async function main(): Promise<void> {
  const environment = parseApiEnvironment(process.env);
  const database = createDatabaseClient({
    connectionString: environment.databaseUrl,
  });
  const storage = new S3Client({
    endpoint: environment.media.endpoint,
    region: environment.media.region,
    forcePathStyle: environment.media.forcePathStyle,
    credentials: {
      accessKeyId: environment.media.accessKeyId,
      secretAccessKey: environment.media.secretAccessKey,
    },
  });
  const failures: string[] = [];

  try {
    const [translations, media, activeResumes, counts] = await Promise.all([
      database.postTranslation.findMany({
        where: { bodyMarkdown: { not: null } },
        select: {
          id: true,
          bodyMarkdown: true,
          bodySha256: true,
          renderedHtml: true,
          rendererVersion: true,
        },
      }),
      database.mediaAsset.findMany({
        select: {
          id: true,
          storageKey: true,
          checksumSha256: true,
          byteSize: true,
        },
      }),
      database.resumeVersion.count({
        where: { activatedAt: { not: null }, retiredAt: null },
      }),
      readCounts(database),
    ]);

    for (const row of translations) {
      const body = row.bodyMarkdown;
      if (body === null) continue;
      const digest = createHash("sha256").update(body).digest("hex");
      if (digest !== row.bodySha256) {
        failures.push(`translation:${row.id}:source-digest`);
        continue;
      }
      try {
        const rendered = await renderArticleBody(body);
        if (
          rendered.html !== row.renderedHtml ||
          rendered.rendererVersion !== row.rendererVersion
        ) {
          failures.push(`translation:${row.id}:render-provenance`);
        }
      } catch {
        failures.push(`translation:${row.id}:render-failed`);
      }
    }

    for (const asset of media) {
      try {
        const object = await storage.send(
          new GetObjectCommand({
            Bucket: environment.media.bucket,
            Key: asset.storageKey,
          })
        );
        const bytes = await object.Body?.transformToByteArray();
        if (bytes === undefined) throw new Error("missing body");
        if (BigInt(bytes.byteLength) !== asset.byteSize) {
          failures.push(`media:${asset.id}:byte-size`);
        }
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== asset.checksumSha256) {
          failures.push(`media:${asset.id}:checksum`);
        }
      } catch {
        failures.push(`media:${asset.id}:missing-object`);
      }
    }

    if (activeResumes > 1) failures.push("resume:multiple-active");
    const report = {
      checkedAt: new Date().toISOString(),
      counts,
      checkedTranslations: translations.length,
      checkedMedia: media.length,
      activeResumes,
      failures,
      status: failures.length === 0 ? "ok" : "failed",
    } as const;
    const output = `${JSON.stringify(report, null, 2)}\n`;
    const outputPath = process.argv
      .find((value) => value.startsWith("--output="))
      ?.slice(9);
    if (outputPath)
      await writeFile(outputPath, output, { encoding: "utf8", flag: "wx" });
    process.stdout.write(output);
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await database.$disconnect();
  }
}

async function readCounts(database: ReturnType<typeof createDatabaseClient>) {
  const [posts, translations, revisions, redirects, media, contacts] =
    await Promise.all([
      database.post.count(),
      database.postTranslation.count(),
      database.contentRevision.count(),
      database.slugRedirect.count(),
      database.mediaAsset.count(),
      database.contactMessage.count(),
    ]);
  return { posts, translations, revisions, redirects, media, contacts };
}

await main();
