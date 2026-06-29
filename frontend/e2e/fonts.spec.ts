import { test, expect } from "@playwright/test";

test("body uses Inter font", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const fontFamily = await page.evaluate(() =>
    getComputedStyle(document.body).fontFamily,
  );
  expect(fontFamily).toContain("Inter");
});

test("code element uses JetBrains Mono font", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Dynamically add a <code> inside .ProseMirror to match the CSS selector
  const fontFamily = await page.evaluate(() => {
    const wrapper = document.createElement("div");
    wrapper.className = "ProseMirror";
    const code = document.createElement("code");
    code.textContent = "test";
    wrapper.appendChild(code);
    document.body.appendChild(wrapper);
    const result = getComputedStyle(code).fontFamily;
    wrapper.remove();
    return result;
  });
  expect(fontFamily).toContain("JetBrains Mono");
});
