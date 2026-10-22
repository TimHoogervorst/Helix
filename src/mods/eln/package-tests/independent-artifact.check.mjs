import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeExtensions = new Set([".py", ".ts", ".tsx"]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "__pycache__", ".git", "prototypes", "package-tests"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

test("ELN runtime sources resolve inside this package or through public APIs", async () => {
  const failures = [];
  for (const file of await walk(root)) {
    if (!runtimeExtensions.has(path.extname(file))) continue;
    const source = await readFile(file, "utf8");
    const relativePath = path.relative(root, file).replaceAll(path.sep, "/");
    if (file.endsWith(".py")) {
      for (const match of source.matchAll(/^\s*(?:from|import)\s+(helix_core(?:\.[\w.]+)?)/gm)) {
        if (match[1] !== "helix_core.public" && !match[1].startsWith("helix_core.public.")) {
          failures.push(`${relativePath}: private backend import ${match[1]}`);
        }
      }
      for (const match of source.matchAll(/^\s*(?:from|import)\s+(bundled(?:\.[\w.]+)?)/gm)) {
        failures.push(`${relativePath}: cross-mod backend import ${match[1]}`);
      }
    }
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier.startsWith("@helix/")) {
        if (specifier !== "@helix/mod-api" && !specifier.startsWith("@helix/mod-api/")) failures.push(`${relativePath}: non-public package ${specifier}`);
        if (specifier.includes("/src/")) failures.push(`${relativePath}: source alias ${specifier}`);
        continue;
      }
      if (!specifier.startsWith(".")) continue;
      const resolved = path.resolve(path.dirname(file), specifier);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        failures.push(`${relativePath}: relative import escapes package (${specifier})`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("ELN npm artifact contains its runtime sources and declarations", async () => {
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, "run this check through npm so npm's CLI path is available");
  const packed = JSON.parse(execFileSync(process.execPath, [npmCli, "pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" }))[0];
  const included = new Set(packed.files.map(({ path: file }) => file));
  const requiredFiles = ["index.ts", "api.ts", "apps.py", "views.py", "mod.py", "contracts/document.json", "workspace/ElnWorkspace.tsx", "editor/extensions/UnifiedSuggestion.ts"];
  const migrations = (await walk(path.join(root, "migrations")))
    .filter((file) => file.endsWith(".py"))
    .map((file) => path.relative(root, file).replaceAll(path.sep, "/"));
  requiredFiles.push(...migrations);
  for (const required of requiredFiles) {
    assert.ok(included.has(required), `${required} is missing from the ELN package`);
  }
  assert.ok(![...included].some((file) => file.startsWith("tests/") || file.includes("/__tests__/")), "test sources should not ship in the ELN runtime package");
  assert.ok(![...included].some((file) => file.startsWith("prototypes/")), "prototypes should not ship in the ELN runtime package");
  assert.ok(![...included].some((file) => file.startsWith("package-tests/")), "package verification sources should not ship in the ELN runtime package");
});
