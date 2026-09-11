import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const adminRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/features/admin"
);

describe("admin media boundaries", () => {
  it("uploads and assigns blog images inside the article editor", async () => {
    const source = await readFile(
      path.join(adminRoot, "AdminBlogEditor.tsx"),
      "utf8"
    );

    expect(source).toContain('adminUpload<BlogImageAsset>("/admin/media"');
    expect(source).toContain('title="Cover image"');
    expect(source).toContain('title="Social image"');
    expect(source).toContain('body.append("visibility", "PUBLIC")');
  });

  it("keeps project and skill forms text-only", async () => {
    const source = await readFile(
      path.join(adminRoot, "AdminCollectionsEditor.tsx"),
      "utf8"
    );

    expect(source).not.toContain("iconMediaId");
    expect(source).not.toContain("imageId");
  });

  it("keeps resume management out of the media library", async () => {
    const source = await readFile(
      path.join(adminRoot, "AdminMediaEditor.tsx"),
      "utf8"
    );

    expect(source).not.toContain("ResumeEditor");
    expect(source).not.toContain("adminRequest<readonly Resume[]>");
  });
});
