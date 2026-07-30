/**
 * Regression test for issue #329: typing "/" in the ELN editor crashes with
 * "Cannot read properties of undefined (reading 'localsInner')".
 *
 * The root cause was Vite bundling two copies of prosemirror-view into the
 * browser bundle, causing instanceof DecorationSet checks to fail across
 * the two copies.  The fix adds prosemirror-* packages to resolve.dedupe
 * in vite.config.ts.
 */
import { test, expect } from "@playwright/test";

/**
 * Authenticate via the Django login endpoint using Playwright's API request,
 * then set the session cookie on the browser context.
 */
async function loginViaApi(page: import("@playwright/test").Page) {
  // First, get a CSRF token by visiting the login page
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Fill and submit the login form
  await page.getByRole("textbox", { name: "Username" }).fill("admin");
  await page.getByRole("textbox", { name: "Password" }).fill("admin");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for redirect away from login page
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 10000,
  });
  console.log("Logged in, current URL:", page.url());
}

test("typing / in ELN editor does not crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  // Authenticate first
  await loginViaApi(page);

  // Navigate to blank ELN entry E4
  await page.goto("/eln/E4");
  await page.waitForLoadState("networkidle");
  // Allow time for editor to mount
  await page.waitForTimeout(1500);

  // Find the ProseMirror editor (it's a contentEditable div with class .ProseMirror)
  const editor = page.locator(".ProseMirror").first();
  await editor.waitFor({ state: "visible", timeout: 10000 });
  await editor.click();

  // Type a slash character — this was the crash trigger
  await page.keyboard.type("/");

  // Wait for any crash to manifest
  await page.waitForTimeout(1000);

  // Check no console errors related to localsInner
  const crashErrors = errors.filter(
    (e) =>
      e.includes("localsInner") ||
      e.includes("Cannot read properties of undefined"),
  );
  expect(crashErrors).toHaveLength(0);

  // The editor should still be present (not crashed and re-rendered)
  const editorStillThere = await page.locator(".ProseMirror").first().isVisible();
  expect(editorStillThere).toBe(true);

  console.log("Errors captured:", errors.length);
});

test("typing # in ELN editor does not crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await loginViaApi(page);

  await page.goto("/eln/E4");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  const editor = page.locator(".ProseMirror").first();
  await editor.waitFor({ state: "visible", timeout: 10000 });
  await editor.click();

  await page.keyboard.type("#");
  await page.waitForTimeout(1000);

  const crashErrors = errors.filter((e) => e.includes("localsInner"));
  expect(crashErrors).toHaveLength(0);

  const editorStillThere = await page.locator(".ProseMirror").first().isVisible();
  expect(editorStillThere).toBe(true);
});
