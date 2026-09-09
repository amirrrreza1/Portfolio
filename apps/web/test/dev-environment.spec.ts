import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

describe("web development environment", () => {
  it("loads the workspace environment before starting Next", async () => {
    const [manifest, launcher] = await Promise.all([
      readFile(path.join(webRoot, "package.json"), "utf8"),
      readFile(path.join(webRoot, "scripts/dev.mjs"), "utf8"),
    ]);

    expect(JSON.parse(manifest).scripts.dev).toBe("node scripts/dev.mjs");
    expect(launcher).toContain('resolve(import.meta.dirname, "../../../.env")');
    expect(launcher).toContain("process.loadEnvFile");
    expect(launcher).not.toContain("--env-file");
  });
});
