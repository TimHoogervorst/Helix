// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJsonPath = resolve(import.meta.dirname, "../package.json");

describe("@helix/mod-api public subpaths", () => {
  it("declares the ELN integration subpaths", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      exports: Record<string, unknown>;
    };

    expect(packageJson.exports).toEqual(
      expect.objectContaining({
        "./editor": expect.any(Object),
        "./blocks": expect.any(Object),
        "./api": expect.any(Object),
        "./contracts": expect.any(Object),
        "./records": expect.any(Object),
        "./theme": expect.any(Object),
        "./theme.css": expect.any(String),
      }),
    );
  });

  it("exports the renderer host and block adapter from public modules", async () => {
    const editor = await import("../src/editor");
    const blocks = await import("../src/blocks");

    expect(editor.TipTapRenderer).toBeTypeOf("function");
    expect(editor.createBlockNode).toBeTypeOf("function");
    expect(blocks.createBlockAdapter).toBeTypeOf("function");
  }, 15_000);

  it("exports the authenticated API client and theme token names", async () => {
    const api = await import("../src/api");
    const theme = await import("../src/theme");

    expect(api.get).toBeTypeOf("function");
    expect(api.post).toBeTypeOf("function");
    expect(api.upload).toBeTypeOf("function");
    expect(theme.themeTokens.primary).toBe("--color-primary");
  }, 15_000);

  it("exports provider-independent record readers and the generic inspector", async () => {
    const records = await import("../src/records");

    expect(records.listPlatformRecords).toBeTypeOf("function");
    expect(records.getExactRecordRevision).toBeTypeOf("function");
    expect(records.listRecordActivity).toBeTypeOf("function");
    expect(records.exportPlatformRecord).toBeTypeOf("function");
    expect(records.uploadPlatformAttachment).toBeTypeOf("function");
    expect(records.RecordValueInspector).toBeTypeOf("function");
  }, 15_000);
});
