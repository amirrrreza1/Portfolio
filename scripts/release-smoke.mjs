const rawBase = process.env.RELEASE_BASE_URL;
if (!rawBase) throw new Error("RELEASE_BASE_URL is required.");
const base = new URL(rawBase);
if (base.username || base.password || base.search || base.hash) {
  throw new Error("RELEASE_BASE_URL must be a credential-free origin.");
}

const checks = [
  ["English home", "/en", "text/html"],
  ["Persian home", "/fa", "text/html"],
  ["robots", "/robots.txt", "text/plain"],
  ["sitemap index", "/sitemap.xml", "application/xml"],
  ["API readiness", "/api/v1/health/ready", "application/json"],
];

let failed = 0;
for (const [name, path, expectedType] of checks) {
  try {
    const response = await fetch(new URL(path, base), {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes(expectedType)) {
      throw new Error(`status=${response.status} content-type=${type}`);
    }
    if (path.endsWith("/ready")) {
      const report = await response.json();
      if (report.status === "unavailable")
        throw new Error("readiness unavailable");
    }
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(
      `FAIL ${name}: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}
if (failed > 0) process.exitCode = 1;
