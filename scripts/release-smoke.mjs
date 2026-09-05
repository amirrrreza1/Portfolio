const rawBase = process.env.RELEASE_BASE_URL;
if (!rawBase) throw new Error("RELEASE_BASE_URL is required.");
const base = new URL(rawBase);
if (
  base.username ||
  base.password ||
  base.search ||
  base.hash ||
  base.pathname !== "/"
) {
  throw new Error("RELEASE_BASE_URL must be a credential-free origin.");
}

const failures = [];

async function check(name, verify) {
  try {
    await verify();
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    failures.push(`${name}: ${message}`);
    console.error(`FAIL ${name}: ${message}`);
  }
}

async function request(path, expectedType, options = {}) {
  const response = await fetch(new URL(path, base), {
    redirect: options.redirect ?? "error",
    signal: AbortSignal.timeout(10_000),
  });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes(expectedType)) {
    throw new Error(`status=${response.status} content-type=${type}`);
  }
  return response;
}

function requireHeader(response, name, pattern) {
  const value = response.headers.get(name) ?? "";
  if (!pattern.test(value)) throw new Error(`${name}=${JSON.stringify(value)}`);
}

async function publicPage(locale) {
  const response = await request(`/${locale}`, "text/html");
  requireHeader(response, "content-security-policy", /default-src 'self'/u);
  requireHeader(response, "x-content-type-options", /^nosniff$/u);
  requireHeader(response, "x-frame-options", /^DENY$/u);
  requireHeader(
    response,
    "referrer-policy",
    /strict-origin-when-cross-origin/u
  );
  const csp = response.headers.get("content-security-policy") ?? "";
  if (csp.includes("'unsafe-eval'")) throw new Error("CSP allows unsafe-eval");
  const html = await response.text();
  const direction = locale === "fa" ? "rtl" : "ltr";
  if (
    !new RegExp(
      `<html[^>]*lang=["']${locale}["'][^>]*dir=["']${direction}["']`,
      "u"
    ).test(html)
  ) {
    throw new Error(`missing lang=${locale} dir=${direction} on <html>`);
  }
}

await check("English public shell and security headers", () =>
  publicPage("en")
);
await check("Persian public shell and security headers", () =>
  publicPage("fa")
);

await check("robots policy", async () => {
  const response = await request("/robots.txt", "text/plain");
  const body = await response.text();
  if (
    !/^Disallow: \/admin$/mu.test(body) ||
    !/^Disallow: \/api\/$/mu.test(body)
  ) {
    throw new Error("admin/API exclusions are missing");
  }
  if (!body.includes(new URL("/sitemap.xml", base).toString())) {
    throw new Error("canonical sitemap is missing");
  }
});

let englishSitemap = "";
await check("sitemap index and locale sitemaps", async () => {
  const index = await request("/sitemap.xml", "application/xml");
  const body = await index.text();
  for (const locale of ["en", "fa"]) {
    const path = `/${locale}/sitemap.xml`;
    if (!body.includes(new URL(path, base).toString())) {
      throw new Error(`${locale} sitemap is absent from the index`);
    }
    const response = await request(path, "application/xml");
    const localeBody = await response.text();
    if (
      !localeBody.includes(`<loc>${new URL(`/${locale}`, base).toString()}`)
    ) {
      throw new Error(`${locale} sitemap has no locale home`);
    }
    if (locale === "en") englishSitemap = localeBody;
  }
});

await check("bilingual RSS feeds", async () => {
  for (const locale of ["en", "fa"]) {
    const response = await request(
      `/${locale}/blog/feed.xml`,
      "application/rss+xml"
    );
    requireHeader(response, "content-language", new RegExp(`^${locale}$`, "u"));
    const body = await response.text();
    if (!body.includes(`<language>${locale}</language>`)) {
      throw new Error(`${locale} feed language is missing`);
    }
  }
});

await check("published article canonical and hreflang", async () => {
  const articleUrl = [
    ...englishSitemap.matchAll(/<loc>([^<]*\/en\/blog\/[^<]+)<\/loc>/gu),
  ]
    .map((match) => match[1])
    .find((value) => !value.includes("/category/") && !value.includes("/tag/"));
  if (!articleUrl)
    throw new Error("English sitemap contains no published article");
  const response = await request(new URL(articleUrl).pathname, "text/html");
  const html = await response.text();
  if (!html.includes('rel="canonical"') || !html.includes(articleUrl)) {
    throw new Error("article canonical is missing or inconsistent");
  }
  for (const language of ["en", "fa", "x-default"]) {
    if (!html.includes(`hreflang="${language}"`)) {
      throw new Error(`article is missing ${language} hreflang`);
    }
  }
});

await check("admin indexing boundary", async () => {
  const response = await request("/admin/login", "text/html");
  requireHeader(response, "x-robots-tag", /noindex.*nofollow.*noarchive/u);
});

await check("API readiness", async () => {
  const response = await request("/api/v1/health/ready", "application/json");
  const report = await response.json();
  if (
    report.status !== "ok" ||
    report.database !== "ok" ||
    report.storage !== "ok" ||
    report.publication !== "ok"
  ) {
    throw new Error(`not fully ready: ${JSON.stringify(report)}`);
  }
});

await check("legacy projects redirect", async () => {
  const response = await fetch(new URL("/projects", base), {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (![307, 308].includes(response.status)) {
    throw new Error(`status=${response.status}`);
  }
  const location = response.headers.get("location");
  if (
    location !== "/en/projects" &&
    location !== new URL("/en/projects", base).toString()
  ) {
    throw new Error(`location=${JSON.stringify(location)}`);
  }
});

if (failures.length > 0) process.exitCode = 1;
