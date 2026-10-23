import { ModRegistry } from "./ModRegistry";
import type { ModManifest } from "./types";
import { Mod } from "./Mod";
import {
  bundledJsonManifestModules,
  bundledModModules,
} from "./bundled";
import {
  externalJsonManifestModules,
  externalModLoaders,
} from "./external";

// ── Mod module shape ────────────────────────────────────────────────────

export interface ModModule {
  meta: ModManifest;
  register: (mod: Mod) => void;
}

// Bundled modules are closed and explicit. External modules are linked npm
// workspaces (or installed packages) composed in external.ts.
const modModules: Record<string, ModModule> = { ...bundledModModules };
const jsonManifestModules: Record<
  string,
  { default: Record<string, unknown> }
> = {
  ...bundledJsonManifestModules,
  ...externalJsonManifestModules,
};

// ── Props ───────────────────────────────────────────────────────────────

interface ModBootData {
  activeMods: string[];
  activeManifests: ModManifest[];
  orderedActiveIds: string[];
  registry: Record<string, unknown>;
}

// ── Component ───────────────────────────────────────────────────────────

/**
 * Owns frontend discovery, registration, authoritative Hydration, and
 * readiness validation. A failed attempt remains terminal for this page.
 */
let bootAttempt: Promise<void> | undefined;

/** Share one boot attempt and settled outcome for the lifetime of this page. */
export function startFrontendBoot(): Promise<void> {
  if (!bootAttempt) bootAttempt = runBootSequence();
  return bootAttempt;
}

/** @internal Test isolation only; a browser reload naturally creates a new attempt. */
export function resetFrontendBootForTests(): void {
  bootAttempt = undefined;
}

async function runBootSequence(): Promise<void> {
  const bootData = await fetchBootData();
  const activeModules = await loadActiveModModules(bootData, jsonManifestModules);
  bootModSystem(activeModules, jsonManifestModules, bootData.orderedActiveIds);
  await hydrateRegistryFromApi(activeModules, jsonManifestModules, bootData);
  ModRegistry.getInstance().validate({ strict: true });
}
async function fetchBootData(): Promise<ModBootData> {
  const response = await fetch("/api/mod-boot/");
  if (!response.ok) {
    throw new Error(`Backend boot data failed (HTTP ${response.status}).`);
  }
  const payload = (await response.json()) as {
    activeMods?: unknown;
    activeModManifests?: unknown;
    registry?: unknown;
  };
  if (!Array.isArray(payload.activeMods) || payload.activeMods.some((id) => typeof id !== "string")) {
    throw new Error("Backend boot data has no valid active Mod set.");
  }
  if (new Set(payload.activeMods).size !== payload.activeMods.length) {
    throw new Error("Backend boot data contains duplicate active Mod IDs.");
  }
  if (!Array.isArray(payload.activeModManifests)) {
    throw new Error("Backend boot data has no authoritative active Mod manifests.");
  }
  if (!payload.registry || typeof payload.registry !== "object") {
    throw new Error("Backend boot data has no valid registry payload.");
  }
  const activeManifests = payload.activeModManifests.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Backend boot data has an invalid active Mod manifest at index ${index}.`);
    }
    return parseJsonManifest(raw as Record<string, unknown>, `backend active Mod ${index}`);
  });
  const activeIds = payload.activeMods as string[];
  if (new Set(activeManifests.map(({ id }) => id)).size !== activeManifests.length ||
      activeManifests.length !== activeIds.length ||
      activeManifests.some(({ id }) => !activeIds.includes(id))) {
    throw new Error("Backend boot data has inconsistent active Mod identities.");
  }
  return {
    activeMods: activeIds,
    activeManifests,
    orderedActiveIds: topologicallyOrderManifests(activeManifests),
    registry: payload.registry as Record<string, unknown>,
  };
}

async function loadActiveModModules(
  bootData: ModBootData,
  jsonModules: Record<string, { default: Record<string, unknown> }>,
): Promise<Record<string, ModModule>> {
  const modules = { ...modModules };
  const manifests = buildJsonManifestMap(jsonModules);
  const activeSet = new Set(bootData.activeMods);
  const authoritative = new Map(bootData.activeManifests.map((manifest) => [manifest.id, manifest]));

  for (const activeId of bootData.activeMods) {
    const activeManifest = authoritative.get(activeId)!;
    const discoveredManifest = [...manifests.values()].find((entry) => entry.manifest.id === activeId)?.manifest;
    if (activeManifest.artifacts.includes("frontend") && !discoveredManifest) {
      throw new Error(`Active Mod '${activeId}' declares a frontend artifact, but no discovered manifest declares it.`);
    }
    if (discoveredManifest && !sameAuthoritativeManifest(activeManifest, discoveredManifest)) {
      throw new Error(`Discovered manifest for active Mod '${activeId}' conflicts with backend boot metadata.`);
    }
    if (!activeManifest.artifacts.includes("frontend")) continue;

    const bundledEntry = Object.keys(modules).some(
      (specifier) => manifestForModule(specifier, manifests)?.manifest.id === activeId,
    );
    const externalEntry = Object.keys(externalModLoaders).find(
      (specifier) => manifestForModule(specifier, manifests)?.manifest.id === activeId,
    );
    if (!bundledEntry && !externalEntry) {
      throw new Error(`Active Mod '${activeId}' declares a frontend artifact, but no loadable frontend entry was discovered.`);
    }
  }

  for (const [specifier, load] of Object.entries(externalModLoaders)) {
    const modId = manifestForModule(specifier, manifests)?.manifest.id;
    if (modId && activeSet.has(modId) && authoritative.get(modId)?.artifacts.includes("frontend")) {
      modules[specifier] = await load();
    }
  }
  return Object.fromEntries(
    Object.entries(modules).filter(([specifier]) => {
      const modId = manifestForModule(specifier, manifests)?.manifest.id;
      return modId ? activeSet.has(modId) && authoritative.get(modId)?.artifacts.includes("frontend") : false;
    }),
  );
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
    // Prefer JSON manifest for metadata when present.
    const jsonEntry = manifestForModule(path, jsonManifestMap);
    const meta = jsonEntry ? jsonEntry.manifest : mod.meta;

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
  orderedActiveIds: string[],
): void {
  const registry = ModRegistry.getInstance();

  const jsonManifestMap = buildJsonManifestMap(jsonModules);

  // Step 1: Collect all discovered mod modules
  const mods = collectMods(modules, jsonManifestMap);

  // No mods yet — nothing to do
  if (mods.length === 0) return;

  // Step 2: Validate no duplicate vendor.name identities
  const seenIds = new Set<string>();
  for (const mod of mods) {
    const id = mod.meta.id;
    if (seenIds.has(id)) {
      throw new Error(`Duplicate mod ID: '${id}'.`);
    }
    seenIds.add(id);
  }

  // Backend-only nodes participate in the authoritative order even though
  // they have no frontend module to register.
  const rank = new Map(orderedActiveIds.map((id, index) => [id, index]));
  const sortedMods = [...mods].sort((a, b) => rank.get(a.meta.id)! - rank.get(b.meta.id)!);

  // Step 4: Register in sorted order (each mod calls register*() → populates registry)
  // Register both vendor.name (uniqueness anchor) and short name (backward
  // compat — existing routes/settings sections still reference modId by
  // short name, e.g. "lims", "eln").
  for (const mod of sortedMods) {
    registry.registerMod(mod.meta.id);
    mod.register(new Mod(mod.meta));
  }

}

// ── Async hydration ────────────────────────────────────────────────────

/**
 * Hydrate backend-owned data from the payload served by the boot barrier.
 * Action definitions are backend-owned and are never synchronized from the
 * client during boot.
 */
async function hydrateRegistryFromApi(
  modules: Record<string, ModModule>,
  jsonModules: Record<string, { default: Record<string, unknown> }>,
  bootData: ModBootData,
): Promise<void> {
  const jsonManifestMap = buildJsonManifestMap(jsonModules);
  const mods = collectMods(modules, jsonManifestMap);

  // Key by short name for backward compatibility with the backend API
  // which returns workspace data keyed by mod name (e.g. "lims", "eln").
  const manifests = new Map(bootData.activeManifests.map((manifest) => [manifest.id, manifest]));

  ModRegistry.getInstance().hydrateFromBackend(bootData.registry, manifests);
}

export function manifestForModule(
  modulePath: string,
  manifests: Map<string, { manifest: ModManifest; path: string }>,
): { manifest: ModManifest; path: string } | undefined {
  const packageRoot = modulePath.replace(
    /\/(?:dist\/)?index\.(?:js|jsx|ts|tsx)$/,
    "",
  );
  return manifests.get(modulePath)
    ?? manifests.get(modulePath.replace(/\/index\.ts$/, "/modManifest.json"))
    ?? manifests.get(`${packageRoot}/modManifest.json`)
    ?? manifests.get(`${modulePath}/manifest`);
}

function sameAuthoritativeManifest(authoritative: ModManifest, discovered: ModManifest): boolean {
  const dependencies = (manifest: ModManifest) => manifest.dependsOn
    .map(({ id, version }) => ({ id, version }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
  return authoritative.id === discovered.id &&
    authoritative.displayName === discovered.displayName &&
    authoritative.version === discovered.version &&
    authoritative.requiresHelix === discovered.requiresHelix &&
    [...authoritative.artifacts].sort().join(",") === [...discovered.artifacts].sort().join(",") &&
    JSON.stringify(dependencies(authoritative)) === JSON.stringify(dependencies(discovered));
}

/** Validate and order every active node, including backend-only Mods. */
function topologicallyOrderManifests(manifests: ModManifest[]): string[] {
  const manifestById = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const inDegree = new Map(manifests.map((manifest) => [manifest.id, 0]));
  const dependents = new Map(manifests.map((manifest) => [manifest.id, [] as string[]]));

  for (const manifest of manifests) {
    for (const dependency of manifest.dependsOn) {
      const dependencyManifest = manifestById.get(dependency.id);
      if (!dependencyManifest) {
        throw new Error(`Active Mod '${manifest.id}' depends on '${dependency.id}', which is not active.`);
      }
      if (!satisfiesVersion(dependencyManifest.version, dependency.version)) {
        throw new Error(`Active Mod '${manifest.id}' requires '${dependency.id}' at '${dependency.version}', but backend metadata reports '${dependencyManifest.version}'.`);
      }
      dependents.get(dependency.id)!.push(manifest.id);
      inDegree.set(manifest.id, inDegree.get(manifest.id)! + 1);
    }
  }

  const ready = [...inDegree].filter(([, degree]) => degree === 0).map(([id]) => id).sort();
  const ordered: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    ordered.push(id);
    for (const dependent of dependents.get(id)!) {
      inDegree.set(dependent, inDegree.get(dependent)! - 1);
      if (inDegree.get(dependent) === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  if (ordered.length !== manifests.length) {
    const remaining = [...inDegree].filter(([, degree]) => degree > 0).map(([id]) => id).sort();
    throw new Error(`Circular dependency detected involving mod(s): ${remaining.join(", ")}`);
  }
  return ordered;
}

type ParsedVersion = [number, number, number, string[]];

function parseVersion(value: string): ParsedVersion {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) throw new Error(`Invalid Mod version '${value}'.`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4]?.split(".") ?? []];
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  if (!left[3].length || !right[3].length) {
    return left[3].length === right[3].length ? 0 : left[3].length ? -1 : 1;
  }
  for (let index = 0; index < Math.min(left[3].length, right[3].length); index += 1) {
    const a = left[3][index];
    const b = right[3][index];
    if (a === b) continue;
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) < Number(b) ? -1 : 1;
    if (/^\d+$/.test(a)) return -1;
    if (/^\d+$/.test(b)) return 1;
    return a < b ? -1 : 1;
  }
  return (left[3].length > right[3].length) - (left[3].length < right[3].length);
}

function satisfiesVersion(version: string, range: string): boolean {
  const actual = parseVersion(version);
  return range.split("||").some((alternative) => {
    const checks: ((candidate: ParsedVersion) => boolean)[] = [];
    for (const rawToken of alternative.trim().split(/\s+/).filter(Boolean)) {
      if (["*", "x", "X"].includes(rawToken)) continue;
      const match = /^(\^|~|<=|>=|<|>|=)?(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?(?:-([0-9A-Za-z.-]+))?$/.exec(rawToken);
      if (!match) return false;
      const operator = match[1] ?? "=";
      const parts = [match[2], match[3], match[4]].filter((part) => part !== undefined && !/[xX*]/.test(part));
      const expected = parseVersion(`${parts.concat(["0", "0"]).slice(0, 3).join(".")}${match[5] ? `-${match[5]}` : ""}`);
      const compare = (candidate: ParsedVersion) => compareVersions(candidate, expected);
      if (operator === "^") {
        const upper: ParsedVersion = expected[0] > 0 ? [expected[0] + 1, 0, 0, []]
          : parts.length === 1 ? [1, 0, 0, []]
            : expected[1] > 0 || parts.length === 2 ? [0, expected[1] + 1, 0, []]
              : [0, 0, expected[2] + 1, []];
        checks.push((candidate) => compareVersions(candidate, expected) >= 0 && compareVersions(candidate, upper) < 0);
      } else if (operator === "~") {
        const upper: ParsedVersion = [expected[0], expected[1] + 1, 0, []];
        checks.push((candidate) => compareVersions(candidate, expected) >= 0 && compareVersions(candidate, upper) < 0);
      } else if (operator === "=" && parts.length < 3) {
        const upper: ParsedVersion = parts.length === 1 ? [expected[0] + 1, 0, 0, []] : [expected[0], expected[1] + 1, 0, []];
        checks.push((candidate) => compareVersions(candidate, expected) >= 0 && compareVersions(candidate, upper) < 0);
      } else {
        checks.push((candidate) => ({
          ">=": compare(candidate) >= 0,
          "<=": compare(candidate) <= 0,
          ">": compare(candidate) > 0,
          "<": compare(candidate) < 0,
          "=": compare(candidate) === 0,
        }[operator]));
      }
    }
    return (!actual[3].length || checks.some((check) => check(actual))) && checks.every((check) => check(actual));
  });
}

// ── JSON manifest helpers ───────────────────────────────────────────────

/**
/**
 * Build a map of module specifier → parsed JSON manifest.
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
    const data = jsonModule.default;
    const manifest = parseJsonManifest(data, path);
    map.set(path, { manifest, path });
  }
  return map;
}

/**
 * Parse and validate a ``modManifest.json`` payload into a ``ModManifest``.
 *
 * The JSON uses camelCase keys matching the frontend schema.
 * ``vendor`` and ``name`` together form the globally-unique mod identity.
 *
 * .. code-block:: json
 *
 *    {
 *      "vendor": "helix",
 *      "name": "eln",
 *      "displayName": "Electronic Lab Notebook",
 *      "version": "0.1.0",
 *      "dependsOn": ["helix.lims", "helix.tags"]
 *    }
 *
 * Object-form dependencies are supported:
 *
 * .. code-block:: json
 *
 *    {
 *      "dependsOn": [
 *        "helix.lims",
 *        {"id": "helix.tags", "version": ">=2.0"}
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
  const allowed = new Set([
    "id", "displayName", "version", "requiresHelix", "artifacts", "dependsOn", "description",
    "contracts", "requiresContracts",
  ]);
  const unknown = Object.keys(data).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`modManifest.json at '${path}' has unknown property '${unknown}'.`);
  if (typeof data.id !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(data.id)) {
    throw new Error(`modManifest.json at '${path}' has an invalid 'id'.`);
  }
  if (typeof data.displayName !== "string" || !data.displayName || typeof data.version !== "string" || typeof data.requiresHelix !== "string") {
    throw new Error(
      `modManifest.json at '${path}' is missing required field 'displayName'.`,
    );
  }
  const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
  const range = (value: string) => value.split("||").every((alternative) => alternative.trim().split(/\s+/).every((token) => token === "*" || /^(\^|~|<=|>=|<|>|=)?\d+(?:\.\d+|\.x|\.X|\.\*)?(?:\.\d+|\.x|\.X|\.\*)?(?:-[0-9A-Za-z.-]+)?$/.test(token)));
  if (!semver.test(data.version) || !range(data.requiresHelix)) throw new Error(`modManifest.json at '${path}' has invalid version constraints.`);

  if (!Array.isArray(data.artifacts) || data.artifacts.length === 0 || data.artifacts.some((artifact) => artifact !== "frontend" && artifact !== "backend") || new Set(data.artifacts).size !== data.artifacts.length) {
    throw new Error(`modManifest.json at '${path}' has invalid 'artifacts'.`);
  }
  const dependsOn = data.dependsOn;
  if (!Array.isArray(dependsOn)) {
    throw new Error(
      `modManifest.json at '${path}': 'dependsOn' must be an array.`,
    );
  }
  const dependencyIds = new Set<string>();

  // Validate each dependsOn entry is a string or an {id, version?} object.
  // String entries must contain a '.' (vendor.name format).
  for (let i = 0; i < dependsOn.length; i++) {
    const entry = dependsOn[i];
    if (typeof entry === "object" && entry !== null) {
      const obj = entry as Record<string, unknown>;
      if (typeof obj.id !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(obj.id) || typeof obj.version !== "string" || !obj.version) {
        throw new Error(
          `modManifest.json at '${path}': dependsOn[${i}] must have id and version.`,
        );
      }
      if (!range(obj.version) && !semver.test(obj.version)) throw new Error(`modManifest.json at '${path}': invalid dependency version.`);
      if (dependencyIds.has(obj.id)) throw new Error(`modManifest.json at '${path}': duplicate dependency '${obj.id}'.`);
      dependencyIds.add(obj.id);
      continue;
    }
    throw new Error(
      `modManifest.json at '${path}': dependsOn[${i}] must be an {id, version} object.`,
    );
  }

  if ("contracts" in data) {
    if (!Array.isArray(data.contracts) ||
        data.contracts.some((entry) => typeof entry !== "string" || entry.length === 0) ||
        new Set(data.contracts).size !== data.contracts.length) {
      throw new Error(`modManifest.json at '${path}' has invalid 'contracts'.`);
    }
  }
  if ("requiresContracts" in data) {
    if (!Array.isArray(data.requiresContracts)) {
      throw new Error(`modManifest.json at '${path}' has invalid 'requiresContracts'.`);
    }
    const references = new Set<string>();
    for (const entry of data.requiresContracts) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error(`modManifest.json at '${path}' has invalid 'requiresContracts'.`);
      }
      const reference = entry as Record<string, unknown>;
      if (Object.keys(reference).some((key) => !["kind", "id", "version"].includes(key)) ||
          (reference.kind !== "data" && reference.kind !== "action") ||
          typeof reference.id !== "string" ||
          !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(reference.id) ||
          typeof reference.version !== "string" ||
          !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(reference.version)) {
        throw new Error(`modManifest.json at '${path}' has invalid 'requiresContracts'.`);
      }
      const key = JSON.stringify([reference.kind, reference.id, reference.version]);
      if (references.has(key)) {
        throw new Error(`modManifest.json at '${path}' has duplicate 'requiresContracts'.`);
      }
      references.add(key);
    }
  }

  return {
    id: data.id as string,
    displayName: data.displayName as string,
    version: data.version as string,
    requiresHelix: data.requiresHelix as string,
    artifacts: data.artifacts as ("frontend" | "backend")[],
    dependsOn: dependsOn as { id: string; version: string }[],
    contracts: data.contracts as ModManifest["contracts"],
    requiresContracts: data.requiresContracts as ModManifest["requiresContracts"],
    description:
      typeof data.description === "string" ? data.description : undefined,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Derive the fully-qualified mod identity from a manifest.
 *
 * ``vendor + "." + name`` is the uniqueness anchor used for duplicate
 * detection, topological sort, and ``registerMod`` identity.
 */
function vendorName(m: ModManifest): string { return m.id; }

// ── Topological Sort (Kahn's algorithm) ─────────────────────────────────

/**
 * Extract the dependency mod ID from a dependsOn entry,
 * which can be a bare string or an object with an `id` field.
 */
function depId(entry: { id: string; version: string }): string {
  return entry.id;
}

/**
 * Sort mods by their ``dependsOn`` declarations so that dependencies
 * load before their dependents.
 *
 * Uses ``vendor.name`` as the node identity.  ``dependsOn`` entries must
 * also be fully-qualified ``vendor.name`` strings.
 *
 * Throws if:
 *   - A mod depends on an unknown mod (missing dependency)
 *   - The graph contains a cycle (circular dependency)
 *
 * Exported for direct unit testing.
 */
export function topologicalSort(mods: ModModule[]): ModModule[] {
  // Build lookup: vendor.name → module
  const modMap = new Map(mods.map((m) => [vendorName(m.meta), m]));

  // In-degree and adjacency maps
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>(); // vendor.name → dependents

  for (const mod of mods) {
    const id = vendorName(mod.meta);
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  // Populate edges: dep → mod (dep must load before mod)
  for (const mod of mods) {
    const modId = vendorName(mod.meta);
    for (const rawDep of mod.meta.dependsOn) {
      const dep = depId(rawDep);
      if (!modMap.has(dep)) {
        throw new Error(
          `Mod '${modId}' depends on '${dep}', which is not registered.`,
        );
      }
      adjacency.get(dep)!.push(modId);
      inDegree.set(modId, (inDegree.get(modId) ?? 0) + 1);
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
      .map((m) => vendorName(m.meta))
      .join(", ");
    throw new Error(
      `Circular dependency detected involving mod(s): ${remaining}`,
    );
  }

  return result;
}
