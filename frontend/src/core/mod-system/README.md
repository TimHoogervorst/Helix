# Mod System

> This document was migrated from `workspaces/core/README.md` and supersedes it.
> See [docs/mod-system.md](../../../docs/mod-system.md) for the full architecture specification.

## What is a Mod?

A **mod** is a self-contained unit of functionality that declares what it provides via `register*()` functions in its `index.ts`. Both built-in functionality (LIMS, ELN, Library) and future external plugins are mods.

Every mod lives under `core-mods/<mod-name>/` and follows a standard directory contract.

## Mod Metadata Contract

Each mod must export from its `index.ts`:

```ts
export const meta = {
  id: string;           // unique mod ID, e.g. 'lims'
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
| `registerLibraryItem(config)` | Register a library item type with card renderers and metadata |
| `registerSettingsSection(config)` | Register a settings panel in the Settings shell |
| `registerRoute(config)` | Register a standalone route |
| `registerSidebarAction(config)` | Register a button/badge on sidebar rows |
| `registerBlock(config)` | Register a content block (e.g., table, image) for the ELN editor |
| `registerService(config)` | Register a callable service for mod-to-mod communication |

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
- **Each hub defines its own item registration** — e.g. Library has `registerLibraryItem()`

## Boot Sequence

```
main.tsx → BrowserRouter → App.tsx → <ModLoader>
  1. Glob all core-mods/*/index.ts via import.meta.glob
  2. Import each, read meta — validate no duplicate IDs
  3. Topological sort by dependsOn — detect cycles, detect missing deps
  4. Call each mod's register() in sorted order → populates ModRegistry
  5. Validate registry — all cross-references resolve
  6. Render children (existing app content)
```

All errors are terminal (fail-fast). No degraded mode.
