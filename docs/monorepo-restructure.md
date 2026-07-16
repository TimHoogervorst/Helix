# Monorepo Restructure — Spec

> Date: 2026-07-16
> Status: Accepted
> Issue: [#237](https://github.com/TimHoogervorst/Helix/issues/237)
> ADR: [0007-monorepo-restructure.md](adr/0007-monorepo-restructure.md)

This document is the canonical spec for the monorepo directory restructure. It defines the target layout, the mod contract, loader behavior, and migration steps.

---

## Target Structure

```
OpenScience/
├── src/
│   ├── shell/                  ← frontend app (Vite, Router, Layout, everything currently in frontend/ except core-mods/)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── core/
│   │       │   ├── api/
│   │       │   ├── mentions/
│   │       │   ├── mod-system/     ← ModRegistry, ModLoader, types, register*() API
│   │       │   ├── shell/          ← App shell: Layout, Router, Console panels
│   │       │   ├── user/
│   │       │   └── workspace/      ← WorkspaceBus, PanelRenderer, slot system
│   │       └── ...
│   │
│   ├── server/                 ← backend (everything currently in backend/ except core_mods/)
│   │   ├── manage.py
│   │   ├── pyproject.toml
│   │   ├── requirements.txt
│   │   ├── Dockerfile
│   │   ├── config/             ← Django settings, urls, wsgi
│   │   ├── core/               ← Django AppConfig for core
│   │   └── helix_core/         ← backend mod runtime (manifest.py, registry.py, loader.py)
│   │
│   └── mods/                   ← built-in mods, co-located frontend + backend
│       ├── eln/
│       ├── lims/
│       ├── library/
│       ├── pins/
│       ├── tags/
│       ├── users/
│       ├── home/
│       └── settings/
│
├── mods/                       ← external mods (gitignored, future — out of scope)
│   └── .gitkeep
│
├── docs/
│   └── adr/
├── docker-compose.yml          ← paths updated to src/server/ and src/shell/
├── package.json                ← thin root: scripts delegate to src/shell/
└── .vscode/
    └── settings.json           ← updated paths for TS/Python tooling
```

---

## The Mod Contract

Every mod in `src/mods/<name>/` is a folder with:

### Required

| File | Purpose |
|------|---------|
| `modManifest.json` | Identity source of truth (see schema below) |
| `package.json` | npm dependencies for this mod |
| `index.ts` | Frontend entry: calls `register*()` functions |
| `mod.py` | Backend entry: declares `manifest` + calls `register(registry)` |

### Convention (optional)

Mods organize by **domain concern**, not by runtime:

```
src/mods/eln/
├── modManifest.json
├── package.json
├── index.ts
├── mod.py
├── types.ts
├── api.ts
├── entries/           ← domain concern: entry editing
│   ├── EntryEditor.tsx
│   └── entry_views.py
├── blocks/            ← domain concern: content blocks
├── components/        ← shared React components
├── hooks/             ← shared React hooks
├── context/           ← React context providers
├── library/           ← library card components
├── settings/          ← settings page
├── models.py          ← Django models
├── views.py           ← DRF views
├── serializers.py
├── urls.py
└── tests/
```

### Flat only

Only one entry pattern is supported: `index.ts` and `mod.py` at the mod root. The nested pattern (`frontend/index.ts` + `backend/mod.py`) is not supported — it recreates the runtime split one level deeper.

---

## `modManifest.json` Schema

```json
{
  "id": "eln",
  "displayName": "Electronic Lab Notebook",
  "version": "0.1.0",
  "coreVersion": ">=1.0.0",
  "dependsOn": [
    { "id": "lims", "version": ">=1.0.0" },
    { "id": "tags" }
  ],
  "icon": "flask-conical",
  "description": "Structured notebook entries with rich-text editing"
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | Yes | `string` | Globally unique mod identifier, e.g. `"eln"` |
| `displayName` | Yes | `string` | Human-readable name, e.g. `"Electronic Lab Notebook"` |
| `version` | Core: no, External: yes | `string` | Semver. Core mods inherit platform version. |
| `coreVersion` | No | `string` | Minimum platform version constraint, e.g. `">=1.0.0"` |
| `dependsOn` | No | `Array<{id: string, version?: string}>` | Direct dependencies with optional version constraints. Non-transitive. |
| `icon` | No | `string` | **Legacy.** Will be removed in a follow-up icon PR. |
| `description` | No | `string` | Short description shown in settings/mod listing. |

The manifest describes **identity only**. Capabilities (routes, blocks, settings, workspaces, entity types) are discovered from `register*()` calls at boot — they are NOT listed in the manifest.

Both frontend and backend loaders read `modManifest.json`. The `meta` export in `index.ts` and the `manifest` variable in `mod.py` are **removed**.

---

## Loader Behavior

### Frontend Loader (`src/shell/src/core/mod-system/ModLoader.tsx`)

```typescript
// Auto-discover all mods via glob
const mods = import.meta.glob("../../mods/*/index.ts", { eager: true });

for (const [path, mod] of Object.entries(mods)) {
  // Read modManifest.json from the same directory
  const manifestPath = path.replace("index.ts", "modManifest.json");
  const manifest = await fetch(manifestPath).then(r => r.json());

  // Validate manifest, check dependencies, register
  registry.registerMod(manifest);
  mod.register(registry);
}
```

### Backend Loader (`src/server/helix_core/mod_system/loader.py`)

```python
# Auto-discover all mods via filesystem glob
mods_root = Path(__file__).parent.parent.parent / "mods"

for mod_dir in mods_root.iterdir():
    if not mod_dir.is_dir():
        continue

    manifest_path = mod_dir / "modManifest.json"
    if not manifest_path.exists():
        continue

    manifest = json.loads(manifest_path.read_text())

    # Validate manifest, check dependencies
    # Add mod to INSTALLED_APPS programmatically
    settings.INSTALLED_APPS.append(f"mods.{manifest['id']}")

    # Import and call register()
    mod = importlib.import_module(f"mods.{manifest['id']}.mod")
    mod.register(registry)
```

`INSTALLED_APPS` in Django settings no longer lists mods explicitly — the loader populates it.

---

## Boot Sequence

1. **Core phase** — loader globs `src/mods/*/index.ts`, reads all manifests, topologically sorts by `dependsOn`, loads all core mods (all load — no filtering)
2. **External phase** — (future) loader globs `mods/*/index.ts`, topologically sorts by `dependsOn`, loads in order. External mods do not need to list core mods in `dependsOn` — core is implicitly available
3. Non-mod Django apps (DRF, corsheaders, etc.) remain explicitly listed in settings

---

## Config Changes

### Root `package.json`

Thin workspace-level scripts only:

```json
{
  "name": "openscience",
  "private": true,
  "scripts": {
    "dev": "cd src/shell && npm run dev",
    "build": "cd src/shell && npm run build",
    "test": "cd src/shell && npm test"
  }
}
```

### `docker-compose.yml`

Paths updated:
- Frontend Dockerfile: `src/shell/Dockerfile`
- Backend Dockerfile: `src/server/Dockerfile`
- Volume mounts updated accordingly

### `.vscode/settings.json`

```json
{
  "eslint.workingDirectories": ["src/shell"],
  "python.analysis.extraPaths": ["src/server"],
  "python.testing.pytestArgs": ["src/server"],
  "typescript.tsdk": "src/shell/node_modules/typescript/lib"
}
```

---

## Migration

**Strategy:** Big-bang. All mods move in one commit. No fallback loader, no dual-path discovery.

Steps:

1. Create `src/shell/`, `src/server/`, `src/mods/` directories
2. Move `frontend/` content (minus `src/core-mods/`) into `src/shell/`
3. Move `backend/` content (minus `core_mods/`) into `src/server/`
4. For each mod, create `src/mods/<name>/` with:
   - `modManifest.json` (from the mod's current `meta`/`manifest` fields)
   - `package.json` (thin, for mod-owned npm deps)
   - `index.ts` (from `frontend/src/core-mods/<name>/index.ts`, minus `meta` export)
   - `mod.py` (from `backend/core_mods/<name>/mod.py`, minus `manifest` variable)
   - All remaining frontend and backend files from both old locations
5. Remove `meta` exports from all `index.ts` files and `manifest` variables from all `mod.py` files
6. Update frontend loader to glob `src/mods/*/index.ts` and read `modManifest.json`
7. Update backend loader to glob `src/mods/` and read `modManifest.json`, auto-populate `INSTALLED_APPS`
8. Update all import paths across the codebase
9. Update `docker-compose.yml`, root `package.json`, `.vscode/settings.json`
10. Remove `frontend/` and `backend/` directories
11. Run dev server, verify boot, smoke-test each mod

---

## Out of Scope

- External mod installation mechanism (git-clone, registry, etc.)
- SDK extraction to `packages/` (separate research + PR)
- Icon field removal (separate PR)
- Nested mod layout support (`frontend/index.ts` + `backend/mod.py`)
