# Monorepo Restructure — co-located mods, single manifest

The current `frontend/` + `backend/` top-level split causes `ModManifest` to be declared twice (TypeScript interface + Python dataclass) with drift already present, and each mod is spread across two directory trees. We restructured to show the three runtime tiers: Platform code lives under `src/helix_core/`, Bundled Mods under `src/bundled/`, and External Mods under `src/mods/`. Each mod has a single `modManifest.json` identity source of truth. Bundled Mods are explicitly enumerated; External Mods remain discovered through the open mod path.

## Considered Options

**Group by runtime (status quo).** Frontend and backend mods were split into separate trees. Mod identity declared twice, in `index.ts` `meta` and `mod.py` `manifest`. Rejected because the dual declaration already drifts and will only get worse as mods grow.

**Group by domain with flat + nested support.** Co-located mods supporting both `index.ts` at root (flat) and `frontend/index.ts` (nested). Rejected the nested variant because it recreates the runtime split one level deeper — mods should organize by domain concern, not by runtime.

**`core/` vs `src/` as the top-level directory.** `src/` chosen because it is standard monorepo convention and keeps the Platform package (`helix_core`) distinct from the preserved Django app label `core`.

## Consequences

- Both frontend and backend loaders now read `modManifest.json` instead of inline `meta`/`manifest` exports
- Backend `INSTALLED_APPS` is populated programmatically by the loader, not maintained manually
- Root-level config is thin: `package.json` delegates to `src/shell/`, `docker-compose.yml` paths updated
- Bundled discovery is closed and External discovery is open; the deployment composition mechanism remains a separate concern
