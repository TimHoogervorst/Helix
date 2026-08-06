import { test, expect } from "@playwright/test";

test("--text-base computes to 16px at default browser font size", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  const computedPx = await page.evaluate(() => {
    const el = document.createElement("span");
    el.style.fontSize = "var(--text-base)";
    document.body.appendChild(el);
    const px = getComputedStyle(el).fontSize;
    el.remove();
    return px;
  });
  expect(computedPx).toBe("16px");
});

test("--icon-md computes to 18px", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  const value = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--icon-md"),
  );
  expect(value.trim()).toBe("18px");
});
