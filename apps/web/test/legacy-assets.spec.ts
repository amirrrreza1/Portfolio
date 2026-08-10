import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import certificates from "../src/DataBase/Certificate.json";
import projects from "../src/DataBase/Projects.json";
import skills from "../src/DataBase/Skills.json";
import quotes from "../src/DataBase/DailyQuote.json";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const publicRoot = path.join(webRoot, "public");

/**
 * Resolves a public URL path case-sensitively.
 *
 * `fs.stat` is not enough: macOS and Windows development filesystems are
 * case-insensitive, so a `/Certificates/web-2.pdf` reference to a file actually
 * named `Web-2.pdf` resolves locally and 404s only once it reaches a Linux
 * container. This walks each segment and compares against the real directory
 * listing, which reproduces the container's behaviour everywhere.
 */
async function resolveCaseSensitively(publicPath: string): Promise<boolean> {
  const segments = publicPath.split("/").filter(Boolean);
  let current = publicRoot;

  for (const segment of segments) {
    const entries = await readdir(current).catch(() => null);
    if (entries === null || !entries.includes(segment)) return false;
    current = path.join(current, segment);
  }

  return (await stat(current)).isFile();
}

describe("legacy public assets", () => {
  it.each(certificates.map((certificate) => certificate.filePath))(
    "resolves certificate asset %s with exact casing",
    async (filePath) => {
      expect(await resolveCaseSensitively(filePath)).toBe(true);
    }
  );

  it("serves a resume file for the download link", async () => {
    expect(await resolveCaseSensitively("/resume.pdf")).toBe(true);
  });

  it("ships only woff2 web fonts", async () => {
    const fontFiles = await readdir(path.join(publicRoot, "Fonts"));
    const unexpected = fontFiles.filter(
      (file) => path.extname(file) !== ".woff2"
    );

    expect(unexpected).toEqual([]);
  });
});

describe("legacy content counts", () => {
  /**
   * These are the counts recorded in docs/BASELINE_M0.md and relied on by the
   * M2 reconciliation. A change here is legitimate only alongside a regenerated
   * baseline, so the test exists to force that pairing rather than to freeze
   * the content forever.
   */
  it("matches the captured M0 baseline", () => {
    const skillCount = skills.reduce(
      (total, category) => total + category.items.length,
      0
    );

    expect({
      projects: projects.length,
      skillCategories: skills.length,
      skills: skillCount,
      certificates: certificates.length,
      quotes: quotes.length,
    }).toEqual({
      projects: 14,
      skillCategories: 6,
      skills: 26,
      certificates: 5,
      quotes: 35,
    });
  });

  it("references no orphan skill ids from projects", () => {
    const knownSkillIds = new Set(
      skills.flatMap((category) => category.items.map((item) => item.id))
    );

    const orphans = projects.flatMap((project) =>
      (project.technologies ?? []).filter((id) => !knownSkillIds.has(id))
    );

    expect(orphans).toEqual([]);
  });
});
