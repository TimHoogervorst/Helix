# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: eln-editor-crash.spec.ts >> typing # in ELN editor does not crash
- Location: e2e\eln-editor-crash.spec.ts:75:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('textbox', { name: 'Username' })

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - img [ref=e7]
    - heading "Helix" [level=1] [ref=e19]
  - generic [ref=e20]:
    - generic [ref=e21]:
      - img [ref=e22]
      - paragraph [ref=e24]: "API error: 500"
    - button "Try again" [ref=e25] [cursor=pointer]
    - link "Go to login" [ref=e26] [cursor=pointer]:
      - /url: /login
```

# Test source

```ts
  1  | /**
  2  |  * Regression test for issue #329: typing "/" in the ELN editor crashes with
  3  |  * "Cannot read properties of undefined (reading 'localsInner')".
  4  |  *
  5  |  * The root cause was Vite bundling two copies of prosemirror-view into the
  6  |  * browser bundle, causing instanceof DecorationSet checks to fail across
  7  |  * the two copies.  The fix adds prosemirror-* packages to resolve.dedupe
  8  |  * in vite.config.ts.
  9  |  */
  10 | import { test, expect } from "@playwright/test";
  11 | 
  12 | /**
  13 |  * Authenticate via the Django login endpoint using Playwright's API request,
  14 |  * then set the session cookie on the browser context.
  15 |  */
  16 | async function loginViaApi(page: import("@playwright/test").Page) {
  17 |   // First, get a CSRF token by visiting the login page
  18 |   await page.goto("/login");
  19 |   await page.waitForLoadState("domcontentloaded");
  20 | 
  21 |   // Fill and submit the login form
> 22 |   await page.getByRole("textbox", { name: "Username" }).fill("admin");
     |                                                         ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  23 |   await page.getByRole("textbox", { name: "Password" }).fill("admin");
  24 |   await page.getByRole("button", { name: "Sign in" }).click();
  25 | 
  26 |   // Wait for redirect away from login page
  27 |   await page.waitForURL((url) => !url.pathname.includes("/login"), {
  28 |     timeout: 10000,
  29 |   });
  30 |   console.log("Logged in, current URL:", page.url());
  31 | }
  32 | 
  33 | test("typing / in ELN editor does not crash", async ({ page }) => {
  34 |   const errors: string[] = [];
  35 |   page.on("console", (msg) => {
  36 |     if (msg.type() === "error") errors.push(msg.text());
  37 |   });
  38 |   page.on("pageerror", (err) => errors.push(err.message));
  39 | 
  40 |   // Authenticate first
  41 |   await loginViaApi(page);
  42 | 
  43 |   // Navigate to blank ELN entry E4
  44 |   await page.goto("/eln/E4");
  45 |   await page.waitForLoadState("domcontentloaded");
  46 |   // Allow time for editor to mount
  47 |   await page.waitForTimeout(1500);
  48 | 
  49 |   // Find the ProseMirror editor (it's a contentEditable div with class .ProseMirror)
  50 |   const editor = page.locator(".ProseMirror").first();
  51 |   await editor.waitFor({ state: "visible", timeout: 10000 });
  52 |   await editor.click();
  53 | 
  54 |   // Type a slash character — this was the crash trigger
  55 |   await page.keyboard.type("/");
  56 | 
  57 |   // Wait for any crash to manifest
  58 |   await page.waitForTimeout(1000);
  59 | 
  60 |   // Check no console errors related to localsInner
  61 |   const crashErrors = errors.filter(
  62 |     (e) =>
  63 |       e.includes("localsInner") ||
  64 |       e.includes("Cannot read properties of undefined"),
  65 |   );
  66 |   expect(crashErrors).toHaveLength(0);
  67 | 
  68 |   // The editor should still be present (not crashed and re-rendered)
  69 |   const editorStillThere = await page.locator(".ProseMirror").first().isVisible();
  70 |   expect(editorStillThere).toBe(true);
  71 | 
  72 |   console.log("Errors captured:", errors.length);
  73 | });
  74 | 
  75 | test("typing # in ELN editor does not crash", async ({ page }) => {
  76 |   const errors: string[] = [];
  77 |   page.on("pageerror", (err) => errors.push(err.message));
  78 | 
  79 |   await loginViaApi(page);
  80 | 
  81 |   await page.goto("/eln/E4");
  82 |   await page.waitForLoadState("domcontentloaded");
  83 |   await page.waitForTimeout(1500);
  84 | 
  85 |   const editor = page.locator(".ProseMirror").first();
  86 |   await editor.waitFor({ state: "visible", timeout: 10000 });
  87 |   await editor.click();
  88 | 
  89 |   await page.keyboard.type("#");
  90 |   await page.waitForTimeout(1000);
  91 | 
  92 |   const crashErrors = errors.filter((e) => e.includes("localsInner"));
  93 |   expect(crashErrors).toHaveLength(0);
  94 | 
  95 |   const editorStillThere = await page.locator(".ProseMirror").first().isVisible();
  96 |   expect(editorStillThere).toBe(true);
  97 | });
  98 | 
```