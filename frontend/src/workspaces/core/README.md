# Workspaces Core

> **Note:** The workspace system has been superseded by the **Mod System**. See [docs/mod-system.md](../../../docs/mod-system.md) for the current architecture.

This directory will be migrated to `core/mod-system/` and `core/console/` as part of the mod system restructure.

## Migration Map

| Current | Destination |
|---------|-------------|
| `workspaces/core/` (contract docs) | `core/mod-system/README.md` |
| `workspaces/_template/` | `core-mods/_template/` |
| `workspaces/lims/` | `core-mods/lims/` |
| `workspaces/eln/` | `core-mods/eln/` |
| `console/instances/library/` | `core-mods/library/` ✅ Done |
| `console/instances/lims/` | `core-mods/lims/console/` |
| `pages/` (standalone workspace pages) | `core-mods/<mod>/workspace/` |
| `components/` (shared) | `shared/` |
| `hooks/` (shared) | `shared/` or `core-mods/<mod>/hooks/` |
| `types/` (shared) | `core/types/` or `core-mods/<mod>/types.ts` |
| `extensions/` (TipTap) | `core-mods/eln/editor/extensions/` |
| `api/` | `core/api/` or `core-mods/<mod>/api.ts` |
