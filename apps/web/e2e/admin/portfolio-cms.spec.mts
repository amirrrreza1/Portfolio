import { expect, test } from "@playwright/test";

const email = process.env.E2E_CMS_OWNER_EMAIL;
const recoveryCode = process.env.E2E_CMS_OWNER_RECOVERY_CODE;
if (!email || !recoveryCode) {
  throw new Error(
    "E2E_CMS_OWNER_EMAIL and E2E_CMS_OWNER_RECOVERY_CODE are required."
  );
}

test.describe.configure({ mode: "serial" });

test("the complete portfolio workspace loads and handles a real conflict", async ({
  page,
  context,
}) => {
  await page.goto("/admin/recovery");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Recovery code").fill(recoveryCode);
  await page.getByRole("button", { name: "Use recovery code" }).click();

  await expect(page.getByTestId("admin-actor")).toContainText("OWNER");
  await page.getByRole("link", { name: "Site content" }).click();
  await expect(
    page.getByRole("heading", { name: "Site content" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Site settings" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "About content" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Appearance options" })
  ).toHaveCount(0);
  await expect(page.getByLabel("Resume button label")).toHaveCount(0);

  await page
    .getByRole("link", { name: "Portfolio collections", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Skills and categories" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Certificates", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Daily quotes" })
  ).toBeVisible();

  await page.getByRole("link", { name: "Media & resume" }).click();
  await expect(
    page.getByRole("heading", { name: "Upload media" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Media library" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Resume versions" })
  ).toBeVisible();

  await page.getByRole("link", { name: "History & access" }).click();
  await expect(
    page.getByRole("heading", { name: "Revision history" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Audit events" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Users and permissions" })
  ).toBeVisible();

  await page.getByRole("link", { name: "Site content" }).click();
  await expect(page.getByTestId("admin-settings-form")).toBeVisible();
  const competing = await context.newPage();
  await competing.goto("/admin/site");
  await expect(competing.getByTestId("admin-settings-form")).toBeVisible();
  const competingForm = competing.getByTestId("admin-settings-form");
  await competingForm.getByLabel("Timezone").fill("Europe/Berlin");
  await competingForm.getByRole("button", { name: "Save changes" }).click();
  await expect(competing.getByText("Site settings saved.")).toBeVisible();

  const staleForm = page.getByTestId("admin-settings-form");
  await staleForm.getByLabel("Timezone").fill("Asia/Tehran");
  await staleForm.getByRole("button", { name: "Save changes" }).click();
  // Next injects its own route announcer with role="alert", so the conflict
  // message is matched by its text rather than by the role alone.
  await expect(
    page.getByRole("alert").filter({ hasText: "This item changed" })
  ).toBeVisible();
  await competing.close();
});
