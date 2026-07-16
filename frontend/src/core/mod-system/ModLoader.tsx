import { type ReactNode, useEffect, useRef, useState } from "react";
import { ModRegistry } from "./ModRegistry";
import type { ModManifest } from "./types";

// ── Mod module shape ────────────────────────────────────────────────────

interface ModModule {
  meta: ModManifest;
  register: () => void;
}

// ── Glob: auto-discover all core mods ────────────────────────────────────

// Vite's static-analysis glob -- eagerly imports all core-mods/index.ts
// modules at build time. During this issue the glob returns {} because
// no core-mods/ directories exist yet. When child issues create them,
// new mods are discovered automatically with zero config changes.
const modModules = import.meta.glob<ModModule>(
  "../../core-mods/*/index.ts",
  { eager: true },
);

// ── Props ───────────────────────────────────────────────────────────────

interface ModLoaderProps {
  children: ReactNode;
}

// ── Component ───────────────────────────────────────────────────────────

/**
 * App entry point component.
 *
 * Boot sequence:
 *   1. Auto-discover all core-mods via glob
 *   2. Import each, read meta -- validate no duplicate IDs
 *   3. Topological sort by dependsOn -- detect cycles, detect missing deps
 *   4. Call each mod's register() in sorted order (mods call register*())
 *   5. Validate registry -- all cross-references resolve
 *   6. Render children
 *
 * All errors are terminal (fail-fast) -- they propagate to React's error
 * boundary. No degraded mode.
 */
export function ModLoader({ children }: ModLoaderProps) {
  // Boot runs exactly once on mount.  useRef gate prevents duplicate
  // registration when React StrictMode double-invokes the effect body.
  const didBoot = useRef(false);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;
    bootModSystem();
    setBooted(true);
  }, []);

  // When mods exist, block children until boot completes.  This prevents
  // LegacyApp / Layout from rendering with an empty registry on the first
  // paint (the singleton mutation does not trigger a React re-render).
  const hasMods = Object.keys(modModules).length > 0;
  if (hasMods && !booted) return null;

  return <>{children}</>;
}

// ── Boot logic (extracted for testability) ──────────────────────────────

function bootModSystem(): void {
  const registry = ModRegistry.getInstance();

  // Step 1: Collect all discovered mod modules
  const mods: ModModule[] = [];
  for (const [path, mod] of Object.entries(modModules)) {
    if (!mod.meta) {
      throw new Error(
        `Mod at '${path}' must export 'meta' (ModManifest).`,
      );
    }
    if (!mod.register || typeof mod.register !== "function") {
      throw new Error(
        `Mod at '${path}' must export a 'register' function.`,
      );
    }
    mods.push(mod);
  }

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
