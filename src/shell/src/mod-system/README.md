# Mod System

> See [docs/mod-system.md](../../../../docs/mod-system.md) for the full architecture specification.

## What is a Mod?

A **mod** is a self-contained unit of functionality that declares what it provides via `register*()` functions in its `index.ts`. Bundled and External Mods use the same registration contract.

Bundled Mods live under `src/bundled/<section>/<mod-name>/` (or a flat section path such as `src/bundled/lims/`). External Mods live under `src/mods/<mod-name>/`. Both follow the same directory contract.

## Mod Metadata Contract

Each mod has a `modManifest.json` identity document and exports from its `index.ts`:

```ts
export const meta = {
  vendor: string;       // author namespace, e.g. 'helix'
  name: string;         // unique mod name, e.g. 'lims'
  displayName: string;  // human-readable, e.g. 'LIMS'
  dependsOn: string[];  // mod IDs that must load first
};

export function register(): void {
  // All register*() calls go here
}
```

## Registration API

| Function | Purpose |
|---|---|
| `registerHub(config)` | Register a hub browsing surface — adds sidebar nav item + route |
| ~~`registerLibraryItem(config)`~~ | (Removed) Library hub now renders entity cards generically from schema columns |
| `registerSettingsSection(config)` | Register a settings panel in the Settings shell |
| `registerRoute(config)` | Register a standalone route |
| ~~`registerSidebarAction(config)`~~ | (Removed) Sidebar actions now use event-driven tabs pattern |
| ~~`registerWorkspace(config)`~~ | (Removed) Workspaces are now hydrated from the backend API |
| `registerBlock(config)` | Register a content block (e.g., table, image) for the ELN editor |

## Mod Directory Contract

| Directory | Purpose | Required? |
|---|---|---|
| `index.ts` | All `register*()` calls — the single entry point Core loads during boot | Yes |
| `types.ts` | Mod's TypeScript interfaces | Yes |
| `api.ts` | Mod's backend API calls | If mod has API endpoints |
| `hub/` | Hub page component (hub browsing surface) | If mod has a hub |
| `workspace/` | Full workspace + standalone page shell | If mod has a workspace |
| `library/` | Library card renderers for the Library hub | If mod registers library items |
| `settings/` | Settings panels registered to the Settings shell | If mod has settings |
| `blocks/` | Content blocks (TipTap nodes, etc.) registered via `registerBlock()` | If mod provides editor content blocks |
| `editor/` | Rich editor + extensions | If mod owns an editor |
| `components/` | Mod-specific shared components | Optional |
| `hooks/` | Mod-specific hooks | Optional |
| `__tests__/` | Tests | Yes |

## Key Rules

- **No direct imports between mods** — use `registry.call()` for mod-to-mod communication
- **Hub IDs are globally unique** — use mod prefix, e.g. `library`, `home`
- **Workspace components fetch their own data** — `WorkspacePage` passes the route param as a prop

## Boot Sequence

```
main.tsx → BrowserRouter → App.tsx → <ModLoader>
  1. Load Bundled Mods from explicit imports in ``src/shell/src/mod-system/bundled.ts``
  2. Discover External Mods from ``src/mods/*/index.ts`` via import.meta.glob
  3. Import each, read metadata from ``modManifest.json`` (preferred) or ``meta`` export — validate no duplicate IDs
  4. Topological sort by dependsOn — detect cycles, detect missing deps
  5. Call each mod's register() in sorted order → populates ModRegistry
  6. Validate registry — all cross-references resolve
  7. Render children (existing app content)
```

All errors are terminal (fail-fast). No degraded mode.
