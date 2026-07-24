import { type ReactNode, useEffect, useRef, useState } from "react";
import { ModRegistry } from "./ModRegistry";
import type { ModManifest } from "./types";

// ── Mod module shape ────────────────────────────────────────────────────

interface ModModule {
  meta: ModManifest;
  register: () => void;
}

// ── Glob: auto-discover all mods ─────────────────────────────────────────

// Vite's static-analysis glob -- eagerly imports all mods/*/index.ts
// modules at build time. When child issues create them, new mods are
// discovered automatically with zero config changes.
const modModules = import.meta.glob<ModModule>(
  "../../../mods/*/index.ts",
  { eager: true },
);

// JSON manifest glob — eagerly imports all mods/*/modManifest.json
// files at build time. When a directory has both index.ts and
// modManifest.json, the JSON manifest takes precedence for metadata.
const jsonManifestModules = import.meta.glob<{
  default: Record<string, unknown>;
}>("../../../mods/*/modManifest.json", { eager: true });

// ── Props ───────────────────────────────────────────────────────────────

interface ModLoaderProps {
  children: ReactNode;
}

// ── Component ───────────────────────────────────────────────────────────

/**
 * App entry point component.
 *
 * Boot sequence:
 *   1. Auto-discover all mods via glob
 *   2. Import each, read meta -- validate no duplicate IDs
 *   3. Topological sort by dependsOn -- detect cycles, detect missing deps
 *   4. Call each mod's register() in sorted order (mods call register*())
 *   5. Validate registry -- all cross-references resolve
 *   6. Render children
 *
 * All errors are terminal (fail-fast) -- they propagate to React's error
 * boundary. No degraded mode.
 *
 * Manifest precedence: when a mod directory contains both ``index.ts``
 * (with inline ``meta``) and ``modManifest.json``, the JSON file wins
 * for metadata.  The ``register`` function always comes from ``index.ts``.
 */
export function ModLoader({ children }: ModLoaderProps) {
  // Boot runs exactly once on mount.  useRef gate prevents duplicate
  // registration when React StrictMode double-invokes the effect body.
  const didBoot = useRef(false);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;

    // Phase 1: Sync boot — manifests, sort, register, validate.
    // This gates rendering so consumers never see an empty registry.
    bootModSystem(modModules, jsonManifestModules);
    setBooted(true);

    // Phase 2: Async hydration — fetch backend mod-registry data.
    // Non-blocking; errors are caught and logged. Workspace icons may
    // briefly show the Box fallback until hydration completes.
    void hydrateRegistryFromApi(modModules, jsonManifestModules);
  }, []);

  // When mods exist, block children until sync boot completes.  This
  // prevents Layout / Router from rendering with an empty registry on
  // the first paint (the singleton mutation does not trigger a React
  // re-render).
  const hasMods = Object.keys(modModules).length > 0;
  if (hasMods && !booted) return null;

  return <>{children}</>;
}

// ── Boot logic (extracted for testability) ──────────────────────────────

/**
 * Collect all discovered mod modules, resolving each one's manifest
 * (JSON manifest preferred over inline ``meta`` export) and validating
 * that it has a ``register`` function.
 *
 * Used by both {@link bootModSystem} and {@link hydrateFromApi}.
 *
 * @internal Exported for direct unit testing.
 */
function collectMods(
  modules: Record<string, ModModule>,
  jsonManifestMap: Map<string, { manifest: ModManifest; path: string }>,
): ModModule[] {
  const mods: ModModule[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const dirName = extractModDir(path);

    // Prefer JSON manifest for metadata when present.
    const jsonEntry = jsonManifestMap.get(dirName);
    const meta: ModManifest = jsonEntry
      ? jsonEntry.manifest
      : mod.meta;

    if (!meta) {
      throw new Error(
        `Mod at '${path}' must export 'meta' (ModManifest) or have a modManifest.json.`,
      );
    }
    if (!mod.register || typeof mod.register !== "function") {
      throw new Error(
        `Mod at '${path}' must export a 'register' function.`,
      );
    }
    mods.push({ meta, register: mod.register });
  }
  return mods;
}

function bootModSystem(
  modules: Record<string, ModModule>,
  jsonModules: Record<string, { default: Record<string, unknown> }>,
): void {
  const registry = ModRegistry.getInstance();

  const jsonManifestMap = buildJsonManifestMap(jsonModules);

  // Step 1: Collect all discovered mod modules
  const mods = collectMods(modules, jsonManifestMap);

  // No mods yet — nothing to do
  if (mods.length === 0) return;

  // Step 2: Validate no duplicate IDs
  const seenIds = new Set<string>();
  for (const mod of mods) {
    if (seenIds.has(mod.meta.id)) {
      throw new Error(`Duplicate mod ID: '${mod.meta.id}'.`);
    }
    seenIds.add(mod.meta.id);
  }

  // Step 3: Topological sort
  const sortedMods = topologicalSort(mods);

  // Step 4: Register in sorted order (each mod calls register*() → populates registry)
  for (const mod of sortedMods) {
    registry.registerMod(mod.meta.id);
    mod.register();
  }

  // Step 5: Validate the populated registry
  registry.validate();
}

// ── Async hydration ────────────────────────────────────────────────────

/**
 * Fetch ``GET /api/mod-registry/`` and hydrate workspace + action catalog
 * data into the registry.
 *
 * Delegates to {@link ModRegistry.loadFromBackend} so the registry is the
 * single owner of its hydration strategy.
 *
 * Runs asynchronously after synchronous boot so it doesn't block
 * rendering.  Errors are non-fatal — the app boots without hydrated
 * workspaces (sidebar falls back to the Box icon).
 */
async function hydrateRegistryFromApi(
  modules: Record<string, ModModule>,
  jsonModules: Record<string, { default: Record<string, unknown> }>,
): Promise<void> {
  const jsonManifestMap = buildJsonManifestMap(jsonModules);
  const mods = collectMods(modules, jsonManifestMap);

  if (mods.length === 0) return;

  const manifests = new Map(mods.map((m) => [m.meta.id, m.meta]));

  await ModRegistry.loadFromBackend(manifests);
}

// ── JSON manifest helpers ───────────────────────────────────────────────

/**
 * Extract the mod directory name from a glob path.
 *
 * ``"../../../mods/eln/index.ts"`` → ``"eln"``
 * ``"../../../mods/eln/modManifest.json"`` → ``"eln"``
 *
 * @internal Exported for direct unit testing.
 */
export function extractModDir(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2];
}

/**
 * Build a map of mod directory name → parsed JSON manifest.
 *
 * Validates each ``modManifest.json`` entry.  Errors are thrown
 * immediately (fail-fast) so bad manifests are caught at boot.
 *
 * @internal Exported for direct unit testing.
 */
function buildJsonManifestMap(
  jsonModules: Record<string, { default: Record<string, unknown> }>,
): Map<string, { manifest: ModManifest; path: string }> {
  const map = new Map<string, { manifest: ModManifest; path: string }>();
  for (const [path, jsonModule] of Object.entries(jsonModules)) {
    const dirName = extractModDir(path);
    const data = jsonModule.default;
    const manifest = parseJsonManifest(data, path);
    map.set(dirName, { manifest, path });
  }
  return map;
}

/**
 * Parse and validate a ``modManifest.json`` payload into a ``ModManifest``.
 *
 * The JSON uses camelCase keys matching the frontend schema:
 *
 * .. code-block:: json
 *
 *    {
 *      "id": "eln",
 *      "displayName": "Electronic Lab Notebook",
 *      "version": "0.1.0",
 *      "dependsOn": ["lims", "tags"]
 *    }
 *
 * Object-form dependencies are supported:
 *
 * .. code-block:: json
 *
 *    {
 *      "dependsOn": [
 *        "lims",
 *        {"id": "tags", "version": ">=2.0"}
 *      ]
 *    }
 *
 * @param data - The parsed JSON object from ``modManifest.json``.
 * @param path - The glob path, used in error messages.
 * @returns A validated ``ModManifest``.
 * @throws If required fields are missing or have the wrong type.
 *
 * @internal Exported for direct unit testing.
 */
export function parseJsonManifest(
  data: Record<string, unknown>,
  path: string,
): ModManifest {
  if (typeof data.id !== "string" || !data.id) {
    throw new Error(
      `modManifest.json at '${path}' is missing required field 'id'.`,
    );
  }
  if (typeof data.displayName !== "string" || !data.displayName) {
    throw new Error(
      `modManifest.json at '${path}' is missing required field 'displayName'.`,
    );
  }

  const dependsOn = data.dependsOn ?? [];
  if (!Array.isArray(dependsOn)) {
    throw new Error(
      `modManifest.json at '${path}': 'dependsOn' must be an array.`,
    );
  }

  // Validate each dependsOn entry is a string or an {id, version?} object.
  for (let i = 0; i < dependsOn.length; i++) {
    const entry = dependsOn[i];
    if (typeof entry === "string") continue;
    if (typeof entry === "object" && entry !== null) {
      const obj = entry as Record<string, unknown>;
      if (typeof obj.id !== "string" || !obj.id) {
        throw new Error(
          `modManifest.json at '${path}': dependsOn[${i}] object must have a non-empty 'id' string.`,
        );
      }
      if (obj.version !== undefined && typeof obj.version !== "string") {
        throw new Error(
          `modManifest.json at '${path}': dependsOn[${i}].version must be a string.`,
        );
      }
      continue;
    }
    throw new Error(
      `modManifest.json at '${path}': dependsOn[${i}] must be a string or an {id, version?} object.`,
    );
  }

  return {
    id: data.id,
    displayName: data.displayName,
    version: typeof data.version === "string" ? data.version : undefined,
    dependsOn: dependsOn as (string | { id: string; version?: string })[],
    coreVersion:
      typeof data.coreVersion === "string" ? data.coreVersion : undefined,
    icon: typeof data.icon === "string" ? data.icon : undefined,
    description:
      typeof data.description === "string" ? data.description : undefined,
  };
}

// ── Topological Sort (Kahn's algorithm) ─────────────────────────────────

/**
 * Extract the dependency mod ID from a dependsOn entry,
 * which can be a bare string or an object with an `id` field.
 */
function depId(entry: string | { id: string; version?: string }): string {
  return typeof entry === "string" ? entry : entry.id;
}

/**
 * Sort mods by their `dependsOn` declarations so that dependencies
 * load before their dependents.
 *
 * Throws if:
 *   - A mod depends on an unknown mod ID (missing dependency)
 *   - The graph contains a cycle (circular dependency)
 *
 * Exported for direct unit testing.
 */
export function topologicalSort(mods: ModModule[]): ModModule[] {
  // Build lookup: id → module
  const modMap = new Map(mods.map((m) => [m.meta.id, m]));

  // In-degree and adjacency maps
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>(); // id → dependents

  for (const mod of mods) {
    inDegree.set(mod.meta.id, 0);
    adjacency.set(mod.meta.id, []);
  }

  // Populate edges: dep → mod (dep must load before mod)
  for (const mod of mods) {
    for (const rawDep of mod.meta.dependsOn) {
      const dep = depId(rawDep);
      if (!modMap.has(dep)) {
        throw new Error(
          `Mod '${mod.meta.id}' depends on '${dep}', which is not registered.`,
        );
      }
      adjacency.get(dep)!.push(mod.meta.id);
      inDegree.set(mod.meta.id, (inDegree.get(mod.meta.id) ?? 0) + 1);
    }
  }

  // Kahn's: start with all nodes that have no unmet dependencies
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const result: ModModule[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(modMap.get(id)!);
    for (const dependent of adjacency.get(id) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  // Cycle detection: if some nodes were never processed, a cycle exists
  if (result.length < mods.length) {
    const remaining = mods
      .filter((m) => !result.includes(m))
      .map((m) => m.meta.id)
      .join(", ");
    throw new Error(
      `Circular dependency detected involving mod(s): ${remaining}`,
    );
  }

  return result;
}
