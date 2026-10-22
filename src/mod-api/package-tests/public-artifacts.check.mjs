import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);

test("built Mod API exports can be consumed from package artifacts", async () => {
  const [root, editor, blocks, portableBlocks, api, contracts, records, theme, host] = await Promise.all([
    import("@helix/mod-api"),
    import("@helix/mod-api/editor"),
    import("@helix/mod-api/blocks"),
    import("@helix/mod-api/portable-blocks"),
    import("@helix/mod-api/api"),
    import("@helix/mod-api/contracts"),
    import("@helix/mod-api/records"),
    import("@helix/mod-api/theme"),
    import("@helix/mod-api/host"),
  ]);

  assert.equal(typeof root.entityReference, "function");
  assert.equal(root.entityReference("FIX1").displayId, "FIX1");
  assert.equal(typeof editor.TipTapRenderer, "function");
  assert.equal(typeof editor.createBlockNode, "function");
  assert.equal(typeof blocks.createBlockAdapter, "function");
  assert.equal(typeof portableBlocks.PortableBlockView, "function");
  assert.equal(typeof portableBlocks.invokeAction, "function");
  assert.equal(typeof portableBlocks.getActionInvocation, "function");
  assert.equal(typeof portableBlocks.resolvePortableActionContext, "function");
  assert.equal(typeof api.get, "function");
  assert.equal(typeof api.getText, "function");
  assert.equal(typeof contracts.contractFingerprint, "function");
  assert.equal(typeof records.listPlatformRecords, "function");
  assert.equal(typeof records.getExactRecordRevision, "function");
  assert.equal(typeof records.exportPlatformRecord, "function");
  assert.equal(typeof records.RecordValueInspector, "function");
  assert.equal(typeof api.post, "function");
  assert.equal(theme.themeTokens.primary, "--color-primary");
  assert.equal(typeof host.get, "function");
  assert.equal(typeof host.ModRegistry, "function");
  assert.equal(typeof host.TableKit, "function");
});

test("the packed package contains every declared runtime entry point", () => {
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, "run this check through npm so the npm CLI path is available");

  const packed = JSON.parse(
    execFileSync(process.execPath, [npmCli, "pack", "--dry-run", "--json"], {
      cwd: packageRoot,
      encoding: "utf8",
    }),
  )[0];
  const includedFiles = new Set(packed.files.map(({ path }) => path));

  for (const entry of Object.values(packageJson.exports)) {
    const file = (typeof entry === "string" ? entry : entry.import).replace(
      /^\.\//,
      "",
    );
    assert.ok(includedFiles.has(file), `${file} is missing from the package`);

    if (typeof entry === "object" && entry.types) {
      const typeFile = entry.types.replace(/^\.\//, "");
      assert.ok(
        includedFiles.has(typeFile),
        `${typeFile} is missing from the package`,
      );
    }
  }

  assert.ok(
    includedFiles.has(packageJson.types.replace(/^\.\//, "")),
    `${packageJson.types} is missing from the package`,
  );
});
