import { expect, test } from "@playwright/test";

const email = process.env.E2E_CMS_OWNER_EMAIL;
const recoveryCode = process.env.E2E_CMS_OWNER_RECOVERY_CODE;
if (!email || !recoveryCode) {
  throw new Error(
    "E2E_CMS_OWNER_EMAIL and E2E_CMS_OWNER_RECOVERY_CODE are required."
  );
}

const suffix = Date.now().toString(36);
const categoryKey = `e2e-cat-${suffix}`;
const tagKey = `e2e-tag-${suffix}`;
const title = `The editor slice ${suffix}`;

test.describe.configure({ mode: "serial" });

/**
 * The editor, in a real browser, against the real API.
 *
 * The API proof already drives every endpoint. What only a browser can answer
 * is whether a person can actually reach them: whether the checklist appears
 * before the author commits, whether a warning has to be acknowledged
 * individually, and whether the directive palette inserts something the
 * renderer accepts rather than something it refuses.
 */
test("an owner can author, check, publish, and preview an article", async ({
  page,
  context,
}) => {
  await page.goto("/admin/recovery");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Recovery code").fill(recoveryCode);
  await page.getByRole("button", { name: "Use recovery code" }).click();
  await expect(page.getByTestId("admin-actor")).toContainText("OWNER");

  await page.getByRole("button", { name: "Articles", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Articles", exact: true })
  ).toBeVisible();

  // Taxonomy first: the article store refuses an unknown category outright,
  // so an author who could not create one could never publish anything.
  await page.getByLabel("New category key").fill(categoryKey);
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByText(categoryKey)).toBeVisible();

  await page.getByLabel("New tag key").fill(tagKey);
  await page.getByRole("button", { name: "Create tag" }).click();
  await expect(page.getByText(tagKey)).toBeVisible();

  await page.getByRole("button", { name: "Start a new article" }).click();
  await expect(
    page.getByRole("heading", { name: "EN translation" })
  ).toBeVisible();

  await page.getByLabel("Title").fill(title);
  // The slug is suggested from the title only while it has never been set.
  await expect(page.getByLabel("Slug")).not.toHaveValue("");

  await page
    .getByLabel("Excerpt")
    .fill("Proving the authoring surface in a real browser.");
  await page
    .getByLabel("SEO description")
    .fill("Proving the authoring surface.");
  await page.getByLabel("Category", { exact: true }).selectOption(categoryKey);
  await page.getByRole("checkbox", { name: tagKey }).check();

  const body = page.getByLabel("Article body in Markdown");
  await body.fill(
    [
      "An opening paragraph that links to [another page](/en/blog) and runs on",
      "long enough to clear the short-body warning without saying anything at",
      "all, which is what a fixture is for. ".repeat(8),
      "",
      "## A section",
      "",
      "- One",
      "- Two",
    ].join("\n")
  );

  // The palette must insert something the renderer accepts; a snippet the
  // pipeline refuses would fail on save, which is the failure a palette exists
  // to prevent.
  await body.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Callout" }).click();
  await expect(body).toContainText(":::callout");

  await page.getByRole("button", { name: "Save article" }).click();
  await expect(page.getByText("Article saved.")).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Publish checklist" })
  ).toBeVisible();
  await expect(
    page.getByText("Nothing is blocking publication.")
  ).toBeVisible();

  const publish = page.getByRole("button", { name: "Publish", exact: true });

  // Each warning is its own checkbox because the API requires them
  // acknowledged by name; one blanket confirmation would let an author agree
  // to a list they never read. Every box in the panel is ticked rather than a
  // chosen few — a test that ticks a subset proves the refusal, not the
  // publish, and that is exactly the mistake this line once made.
  const warnings = page.getByTestId("publish-checklist").getByRole("checkbox");
  const count = await warnings.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await warnings.nth(index).check();
  }

  await publish.click();
  // Asserted on the workspace status line rather than by searching the page,
  // so a refusal reports the message the author would actually have read.
  await expect(page.getByTestId("blog-workspace-status")).toHaveText(
    "Article published and its cache invalidated."
  );

  // Preview is part of the same flow rather than its own test: a recovery
  // code is single use, so a second sign-in would need a second code and
  // would prove nothing extra about the editor.
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Preview" }).click();
  const preview = await opened;
  await preview.waitForLoadState();

  await expect(preview.getByText("Preview — not published")).toBeVisible();
  await expect(preview.locator(".blog-reading-surface h2")).toBeVisible();
  await expect(preview.locator(".blog-reading-surface aside")).toBeVisible();
  await expect(preview.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/
  );
});
