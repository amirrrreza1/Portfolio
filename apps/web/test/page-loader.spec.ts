import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src"
);

describe("public page loading boundary", () => {
  it("covers both initial hydration and streamed route transitions", async () => {
    const [mainLayout, routeFallback] = await Promise.all([
      readFile(
        path.join(sourceRoot, "Components/Layout/MainLayout.tsx"),
        "utf8"
      ),
      readFile(path.join(sourceRoot, "app/[locale]/loading.tsx"), "utf8"),
    ]);

    expect(mainLayout).toContain("<PageReadyLoader />");
    expect(routeFallback).toContain('<CodeLoaderVisual kind="route" />');
  });

  it("waits for the document, fonts, and Rubik frame with a safety release", async () => {
    const [loader, rubik] = await Promise.all([
      readFile(
        path.join(sourceRoot, "Components/PageLoader/PageReadyLoader.tsx"),
        "utf8"
      ),
      readFile(
        path.join(sourceRoot, "Components/RubikCube/RubikCube.tsx"),
        "utf8"
      ),
    ]);

    expect(loader).toContain('document.readyState === "complete"');
    expect(loader).toContain("document.fonts.ready");
    expect(loader).toContain("waitForRubikFrame(readinessController.signal)");
    expect(loader).toContain("SAFETY_TIMEOUT_MS");
    expect(loader).toContain('dataset.pageLoading = "true"');
    expect(rubik).toContain("data-rubik-canvas");
    expect(rubik).toContain("data-ready={ready}");
    expect(rubik).toContain("requestAnimationFrame(onFirstFrame)");
  });

  it("keeps the loader monochrome and borderless", async () => {
    const css = await readFile(
      path.join(sourceRoot, "app/globals.css"),
      "utf8"
    );
    const loaderStyles = css.slice(
      css.indexOf(".site-loader {"),
      css.indexOf("@layer components {", css.indexOf(".site-loader {"))
    );

    expect(loaderStyles).not.toContain("border:");
    expect(loaderStyles).not.toContain("var(--color-accent)");
    expect(loaderStyles).not.toContain("var(--color-danger)");
    expect(loaderStyles).not.toContain("var(--color-success)");
  });
});
