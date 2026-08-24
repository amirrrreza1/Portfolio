import {
  PREFERENCES_COOKIE_NAME,
  PREFERENCES_VERSION,
  serializeAppearanceCookie,
  THEME_TOKENS,
} from "@portfolio/contracts/appearance";
import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";

import { fixtureApiOrigin, webOrigin } from "./config";

/**
 * THEMING.md §9, against a rendered page.
 *
 * Each `test.describe` below names the §9 bullet it discharges. What is asserted
 * is the visitor-visible behaviour, not the implementation: the first byte, the
 * computed style, the requests the browser actually issues, and the headers the
 * response actually carries.
 */

const ARTICLE_SLUG_EN = "theme-token-matrix";
const ARTICLE_EN = `/en/blog/${ARTICLE_SLUG_EN}`;
const ARTICLE_FA = "/fa/blog/%D9%85%D8%A7%D8%AA%D8%B1%DB%8C%D8%B3-%D8%AA%D9%85";

/** GitHub Light / GitHub Dark values for the `const` keyword in the fixture. */
const KEYWORD_LIGHT = "rgb(215, 58, 73)";
const KEYWORD_DARK = "rgb(249, 117, 131)";

function cookie(value: string) {
  return {
    name: PREFERENCES_COOKIE_NAME,
    value,
    domain: "127.0.0.1",
    path: "/",
  };
}

function preference(preferences: Record<string, string>) {
  return cookie(serializeAppearanceCookie(preferences as never));
}

/** The first byte, before any script has run. */
async function firstResponseHtml(page: Page, path: string): Promise<string> {
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  return response.text();
}

function rootAttribute(html: string, attribute: string): string | null {
  const tag = /<html[^>]*>/.exec(html)?.[0] ?? "";
  return new RegExp(`${attribute}="([^"]*)"`).exec(tag)?.[1] ?? null;
}

test.describe("no flash: the first byte already carries the preference", () => {
  test("emits a cookie theme on <html> before any script runs", async ({
    page,
  }) => {
    await page.context().addCookies([preference({ theme: "light" })]);

    const html = await firstResponseHtml(page, "/en");
    expect(rootAttribute(html, "data-theme")).toBe("light");

    // Nothing about the served markup depends on the client: the attribute is
    // present in the bytes, not added by hydration.
    expect(html).not.toContain('data-theme="dark"');
  });

  test("does not correct the theme after hydration", async ({ page }) => {
    const mismatches: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (/hydrat/i.test(text) && message.type() === "error") {
        mismatches.push(text);
      }
    });

    await page.context().addCookies([preference({ theme: "light" })]);
    await page.goto("/en");

    const observed = await page.evaluate(async () => {
      const seen: string[] = [];
      const root = document.documentElement;
      seen.push(root.dataset.theme ?? "");
      const observer = new MutationObserver(() => {
        seen.push(root.dataset.theme ?? "");
      });
      observer.observe(root, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      observer.disconnect();
      return seen;
    });

    expect(new Set(observed)).toEqual(new Set(["light"]));
    expect(mismatches).toEqual([]);
  });

  test("paints the theme's own background, not the other theme's", async ({
    page,
  }) => {
    await page.context().addCookies([preference({ theme: "light" })]);
    await page.goto("/en");

    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)"
    );

    await page.context().clearCookies();
    await page.context().addCookies([preference({ theme: "dark" })]);
    await page.goto("/en");

    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(0, 0, 0)"
    );
  });
});

test.describe("system mode resolves before first paint and follows the OS", () => {
  test("resolves the operating system's scheme without a flash", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.context().addCookies([preference({ theme: "system" })]);
    await page.goto("/en");

    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-theme", "system");
    await expect(root).toHaveAttribute("data-system-theme", "light");
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)"
    );
  });

  test("follows a live prefers-color-scheme change", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.context().addCookies([preference({ theme: "system" })]);
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute(
      "data-system-theme",
      "light"
    );

    await page.emulateMedia({ colorScheme: "dark" });

    await expect(page.locator("html")).toHaveAttribute(
      "data-system-theme",
      "dark"
    );
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(0, 0, 0)"
    );
  });

  test("is still correct with JavaScript disabled", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: webOrigin,
      javaScriptEnabled: false,
      colorScheme: "light",
    });
    await context.addCookies([preference({ theme: "system" })]);
    const page = await context.newPage();
    await page.goto("/en");

    // The pre-paint script never runs, so `data-system-theme` is absent and the
    // `@media (prefers-color-scheme)` fallback scoped `:not([data-system-theme])`
    // is what has to carry the page.
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-system-theme",
      /.*/
    );
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)"
    );
    // Readable, not merely styled: the shell rendered its content server-side.
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
    expect((await main.innerText()).trim().length).toBeGreaterThan(0);

    await context.close();
  });
});

test.describe("cookie tampering falls back without an error page", () => {
  const tampered: readonly (readonly [string, string])[] = [
    ["an unknown theme", encodeURIComponent('{"v":1,"theme":"neon"}')],
    ["a wrong version", encodeURIComponent('{"v":99,"theme":"light"}')],
    ["malformed JSON", encodeURIComponent('{"v":1,"theme":')],
    ["an unknown field", encodeURIComponent('{"v":1,"theme":"light","x":1}')],
    ["a non-object", encodeURIComponent('"light"')],
    [
      "an oversized value",
      encodeURIComponent(`{"v":1,"pad":"${"x".repeat(3_000)}"}`),
    ],
    ["raw markup", encodeURIComponent('{"v":1,"theme":"</html><script>"}')],
  ];

  for (const [description, value] of tampered) {
    test(`discards ${description}`, async ({ page }) => {
      await page.context().addCookies([cookie(value)]);

      const response = await page.request.get("/en");
      expect(response.status()).toBe(200);

      const html = await response.text();
      expect(rootAttribute(html, "data-theme")).toBe("dark");
      // A discarded value must not survive anywhere in the document either.
      expect(html).not.toContain("neon");
      expect(html).not.toContain("</html><script>");
    });
  }
});

test.describe("allowlist enforcement", () => {
  test("cannot activate a font the locale does not offer", async ({ page }) => {
    // `jetbrains-mono` is Latin-only, so the Persian appearance DTO does not
    // enable it. A cookie asking for it must resolve to the Persian default.
    await page
      .context()
      .addCookies([preference({ theme: "dark", blogFont: "jetbrains-mono" })]);
    await page.goto(ARTICLE_FA);

    const surface = page.locator(".blog-reading-surface");
    await expect(surface).toHaveAttribute("data-blog-font", "vazir-code");
  });

  test("honours a font the locale does offer", async ({ page }) => {
    await page
      .context()
      .addCookies([preference({ theme: "dark", blogFont: "system-sans" })]);
    await page.goto(ARTICLE_EN);

    await expect(page.locator(".blog-reading-surface")).toHaveAttribute(
      "data-blog-font",
      "system-sans"
    );
  });
});

test.describe("caching: appearance never enters a shared key", () => {
  test("sends no Vary: Cookie on a public page", async ({ page }) => {
    await page.context().addCookies([preference({ theme: "light" })]);

    for (const path of ["/en", ARTICLE_EN]) {
      const response = await page.request.get(path);
      expect(response.status()).toBe(200);
      const vary = response.headers()["vary"] ?? "";
      expect(vary.toLowerCase()).not.toContain("cookie");
    }
  });

  test("two visitors with different preferences read one shared entry", async ({
    browser,
  }) => {
    // A differential, not an absolute count. What must not happen is that
    // appearance enters the shared key — and that shows up as *more upstream
    // work for two different cookies than for two identical ones*, whatever
    // number of revalidations the framework happens to perform.
    const sameCookie = await visitTwice(browser, [
      { theme: "dark", blogSize: "md" },
      { theme: "dark", blogSize: "md" },
    ]);
    const differentCookies = await visitTwice(browser, [
      { theme: "light", blogSize: "xl" },
      { theme: "dark", blogSize: "sm" },
    ]);

    expect(differentCookies.bodies).toEqual(sameCookie.bodies);
    expect(differentCookies.requests).toEqual(sameCookie.requests);

    // And the article body itself was transferred at most once for the two
    // visits, which is the shared entry being reused rather than rebuilt.
    expect(differentCookies.bodies).toBeLessThanOrEqual(1);

    // …while each visitor still got their own shell.
    expect(differentCookies.shells).toEqual([
      { theme: "light", size: "xl" },
      { theme: "dark", size: "sm" },
    ]);
  });
});

test.describe("blog typography stays inside the reading surface", () => {
  test("puts the preference on the surface and nowhere else", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([preference({ theme: "dark", blogSize: "xl" })]);
    await page.goto(ARTICLE_EN);

    const surface = page.locator(".blog-reading-surface");
    await expect(surface).toHaveAttribute("data-blog-size", "xl");

    const strays = await page.evaluate(() =>
      [...document.querySelectorAll("[data-blog-font], [data-blog-size]")]
        .filter(
          (element) => !element.classList.contains("blog-reading-surface")
        )
        .map((element) => element.tagName)
    );
    expect(strays).toEqual([]);

    const rootHasPreference = await page.evaluate(() => ({
      font: document.documentElement.dataset.blogFont ?? null,
      size: document.documentElement.dataset.blogSize ?? null,
      bodyFont: document.body.dataset.blogFont ?? null,
    }));
    expect(rootHasPreference).toEqual({
      font: null,
      size: null,
      bodyFont: null,
    });
  });

  test("does not resize shared chrome", async ({ page }) => {
    const sizes: Record<string, string> = {};

    for (const step of ["sm", "xl"] as const) {
      const context = await page.context();
      await context.clearCookies();
      await context.addCookies([preference({ theme: "dark", blogSize: step })]);
      await page.goto(ARTICLE_EN);

      sizes[`surface-${step}`] = await page
        .locator(".blog-reading-surface")
        .evaluate((element) => getComputedStyle(element).fontSize);
      sizes[`header-${step}`] = await page
        .locator("header")
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize);
    }

    expect(sizes["surface-sm"]).not.toBe(sizes["surface-xl"]);
    expect(sizes["header-sm"]).toBe(sizes["header-xl"]);
  });

  test("keeps a blog family off a non-blog route", async ({ page }) => {
    await page
      .context()
      .addCookies([preference({ theme: "dark", blogFont: "vazir-code" })]);

    const fontRequests = trackFontRequests(page);
    await page.goto("/en");
    await page.waitForLoadState("networkidle");

    expect(fontRequests.filter((url) => /Vazir/i.test(url))).toEqual([]);
  });

  test("requests only woff2, and only declared faces", async ({ page }) => {
    const fontRequests = trackFontRequests(page);
    await page.goto(ARTICLE_EN);
    await page.waitForLoadState("networkidle");

    expect(fontRequests.length).toBeGreaterThan(0);
    for (const url of fontRequests) {
      expect(url).toMatch(/\.woff2($|\?)/);
    }
  });
});

test.describe("reduced motion", () => {
  test("the system preference alone disables animation", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: webOrigin,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto("/en");

    // `motion: system` is the default, so nothing has been chosen in the modal.
    await expect(page.locator("html")).toHaveAttribute("data-motion", "system");

    expect(await animationSeconds(page)).toBeLessThan(0.001);

    await context.close();
  });

  test("an explicit reduced choice disables animation on its own", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([preference({ theme: "dark", motion: "reduced" })]);
    await page.goto("/en");

    await expect(page.locator("html")).toHaveAttribute(
      "data-motion",
      "reduced"
    );
    expect(await animationSeconds(page)).toBeLessThan(0.001);
  });

  test("leaves animation alone when neither asks for it", async ({ page }) => {
    // The control. Without it the two assertions above would still pass if the
    // probe simply had no animation at all.
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "system");
    expect(await animationSeconds(page)).toBeGreaterThan(0.5);
  });
});

test.describe("settings dialog accessibility", () => {
  test("traps focus, closes on Escape, and restores the trigger", async ({
    page,
  }) => {
    await page.goto("/en");

    const trigger = page.locator("header button[aria-haspopup='dialog']");
    await trigger.first().focus();
    await page.keyboard.press("Enter");

    const dialog = page.locator("header dialog[aria-modal='true']");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-labelledby", /.+/);

    const labelId = await dialog.getAttribute("aria-labelledby");
    await expect(page.locator(`#${labelId}`)).toBeVisible();

    // A modal <dialog> confines the tab ring to its own subtree. Walk further
    // than the dialog has focusable controls and assert nothing behind the
    // modal ever takes focus.
    //
    // `<body>` is allowed and is not an escape: tabbing past the last control
    // hands focus to the browser's own UI, and the document reports `body` for
    // as long as that lasts. What would be a real failure is a control from the
    // page behind the dialog — a header link, the footer's second settings
    // trigger — becoming active.
    const escapes: string[] = [];
    for (let step = 0; step < 25; step += 1) {
      await page.keyboard.press("Tab");
      const outside = await page.evaluate(() => {
        const active = document.activeElement;
        if (active === null || active === document.body) return null;
        const dialogElement = document.querySelector("dialog[open]");
        if (dialogElement !== null && dialogElement.contains(active)) {
          return null;
        }
        return `${active.tagName.toLowerCase()}.${active.className}`;
      });
      if (outside !== null) escapes.push(`step ${step}: ${outside}`);
    }
    expect(escapes).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    const triggerFocused = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-haspopup") === "dialog"
    );
    expect(triggerFocused).toBe(true);
  });

  test("changes appearance live and can be reset by keyboard alone", async ({
    page,
  }) => {
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.locator("header button[aria-haspopup='dialog']").first().click();
    await page
      .locator("dialog[open] [role='radio']", { hasText: /^Light$/ })
      .first()
      .click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)"
    );

    // The choice is written to the cookie, so the next server render agrees.
    const cookies = await page.context().cookies();
    const stored = cookies.find(
      (entry) => entry.name === PREFERENCES_COOKIE_NAME
    );
    expect(stored).toBeDefined();
    expect(
      JSON.parse(decodeURIComponent(stored?.value ?? "{}")) as {
        v: number;
        theme: string;
      }
    ).toMatchObject({ v: PREFERENCES_VERSION, theme: "light" });
  });
});

test.describe("legacy localStorage migration — THEMING.md §5.6", () => {
  test("adopts a valid legacy value once and removes the key", async ({
    page,
  }) => {
    await page.goto("/en");
    await page.evaluate(() => window.localStorage.setItem("theme", "light"));
    await page.context().clearCookies();
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("theme")))
      .toBe(null);

    const cookies = await page.context().cookies();
    expect(
      cookies.find((entry) => entry.name === PREFERENCES_COOKIE_NAME)?.value
    ).toContain("light");
  });

  test("discards a malformed legacy value", async ({ page }) => {
    await page.goto("/en");
    await page.evaluate(() => window.localStorage.setItem("theme", "neon"));
    await page.context().clearCookies();
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("theme")))
      .toBe(null);
  });

  test("never overrides an existing valid cookie", async ({ page }) => {
    await page.context().addCookies([preference({ theme: "dark" })]);
    await page.goto("/en");
    await page.evaluate(() => window.localStorage.setItem("theme", "light"));
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("code blocks follow the selected theme — THEMING.md §3", () => {
  test("uses the dark Shiki output and the dark code surface", async ({
    page,
  }) => {
    await page.context().addCookies([preference({ theme: "dark" })]);
    await page.goto(ARTICLE_EN);

    const block = page.locator("pre.code-block").first();
    await expect(block).toHaveCSS(
      "background-color",
      hexToRgb(THEME_TOKENS.dark["code-bg"])
    );
    await expect(keyword(block)).toHaveCSS("color", KEYWORD_DARK);
  });

  test("switches to the light Shiki output with the light theme", async ({
    page,
  }) => {
    await page.context().addCookies([preference({ theme: "light" })]);
    await page.goto(ARTICLE_EN);

    const block = page.locator("pre.code-block").first();
    await expect(block).toHaveCSS(
      "background-color",
      hexToRgb(THEME_TOKENS.light["code-bg"])
    );
    await expect(keyword(block)).toHaveCSS("color", KEYWORD_LIGHT);
  });

  test("follows the selected theme, not the operating system", async ({
    browser,
  }) => {
    // The defect this replaces: a `dark:` variant or a bare media query renders
    // dark-theme code colours for a light-theme visitor on a dark OS.
    const context = await browser.newContext({
      baseURL: webOrigin,
      colorScheme: "dark",
    });
    await context.addCookies([preference({ theme: "light" })]);
    const page = await context.newPage();
    await page.goto(ARTICLE_EN);

    const block = page.locator("pre.code-block").first();
    await expect(block).toHaveCSS(
      "background-color",
      hexToRgb(THEME_TOKENS.light["code-bg"])
    );
    await expect(keyword(block)).toHaveCSS("color", KEYWORD_LIGHT);

    await context.close();
  });
});

test.describe("security headers — THEMING.md §8", () => {
  const required: readonly (readonly [string, RegExp])[] = [
    ["content-security-policy", /default-src 'self'/],
    ["referrer-policy", /strict-origin-when-cross-origin/],
    ["x-content-type-options", /nosniff/],
    ["x-frame-options", /DENY/],
    ["cross-origin-opener-policy", /same-origin/],
    ["permissions-policy", /camera=\(\)/],
  ];

  test("a public page carries the full set and no unsafe-eval", async ({
    page,
  }) => {
    const response = await page.request.get("/en");
    const headers = response.headers();

    for (const [name, pattern] of required) {
      expect(headers[name], name).toMatch(pattern);
    }
    expect(headers["content-security-policy"]).not.toContain("'unsafe-eval'");
    expect(headers["content-security-policy"]).toMatch(/script-src[^;]*nonce-/);
  });

  test("the localized 503 carries them too", async ({ page }) => {
    await page.request.get(`${fixtureApiOrigin}/__fixture/fail?value=1`);
    try {
      const response = await page.request.get("/fa");
      expect(response.status()).toBe(503);

      const headers = response.headers();
      for (const [name, pattern] of required) {
        expect(headers[name], name).toMatch(pattern);
      }
      expect(headers["retry-after"]).toBe("60");
      expect(headers["content-language"]).toBe("fa");

      const html = await response.text();
      expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
      expect(html).toContain('dir="rtl"');
    } finally {
      await page.request.get(`${fixtureApiOrigin}/__fixture/fail?value=0`);
    }
  });

  test("reports no CSP violation while rendering an article", async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      if (/Content Security Policy/i.test(error.message)) {
        violations.push(error.message);
      }
    });

    await page.goto(ARTICLE_EN);
    await page.waitForLoadState("networkidle");

    expect(violations).toEqual([]);
  });
});

/**
 * The `const` keyword's own Shiki span, not the line wrapper that contains it.
 * `hasText` matches ancestors too, and the wrapper carries the theme's default
 * foreground — which changes with the theme and so would pass a weaker
 * assertion while proving nothing about token colours.
 */
/**
 * Two visits to the same article in fresh contexts, reporting how much upstream
 * work they caused and what shell each one received.
 */
async function visitTwice(
  browser: Browser,
  cookies: readonly Record<string, string>[]
): Promise<{
  readonly requests: number;
  readonly bodies: number;
  readonly shells: { theme: string | null; size: string | null }[];
}> {
  const warm = await browser.newContext({ baseURL: webOrigin });
  // Warm first, then reset: a cold cache would charge the first pair for work
  // the second pair inherits.
  await warm.request.get(ARTICLE_EN);
  await warm.request.get(`${fixtureApiOrigin}/__fixture/requests?reset=1`);

  const shells: { theme: string | null; size: string | null }[] = [];

  for (const preferences of cookies) {
    const context = await browser.newContext({ baseURL: webOrigin });
    await context.addCookies([preference(preferences)]);
    const page = await context.newPage();
    await page.goto(ARTICLE_EN);
    shells.push({
      theme: await page.locator("html").getAttribute("data-theme"),
      size: await page
        .locator(".blog-reading-surface")
        .getAttribute("data-blog-size"),
    });
    await context.close();
  }

  const counts = (await warm.request
    .get(`${fixtureApiOrigin}/__fixture/requests`)
    .then((response) => response.json())) as {
    requests: Record<string, number>;
    bodies: Record<string, number>;
  };
  await warm.close();

  const forArticle = (counter: Record<string, number>) =>
    Object.entries(counter)
      .filter(([key]) => key === `en/blog/posts/${ARTICLE_SLUG_EN}`)
      .reduce((total, [, value]) => total + value, 0);

  return {
    requests: forArticle(counts.requests),
    bodies: forArticle(counts.bodies),
    shells,
  };
}

function keyword(block: Locator): Locator {
  return block.getByText("const", { exact: true }).first();
}

async function animationSeconds(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "typewriter-cursor";
    document.body.append(probe);
    const value = Number.parseFloat(getComputedStyle(probe).animationDuration);
    probe.remove();
    return value;
  });
}

function trackFontRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request: Request) => {
    const url = request.url();
    if (request.resourceType() === "font" || /\/Fonts\//.test(url)) {
      urls.push(url);
    }
  });
  return urls;
}

function hexToRgb(hex: string): string {
  const value = hex.replace("#", "");
  const channel = (offset: number) =>
    Number.parseInt(value.slice(offset, offset + 2), 16);
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
}
