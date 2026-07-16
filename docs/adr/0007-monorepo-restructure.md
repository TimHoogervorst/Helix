# Monorepo Restructure — co-located mods, single manifest

The current `frontend/` + `backend/` top-level split causes `ModManifest` to be declared twice (TypeScript interface + Python dataclass) with drift already present, and each mod is spread across two directory trees. We restructured to group by domain: mods live co-located under `src/mods/`, each with a single `modManifest.json` as the identity source of truth. Both frontend and backend loaders auto-discover mods via glob — mod identity is read from the manifest, mod capabilities are discovered from `register*()` calls at boot.

## Considered Options

**Group by runtime (status quo).** `frontend/src/core-mods/` + `backend/core_mods/`. Mod identity declared twice, in `index.ts` `meta` and `mod.py` `manifest`. Rejected because the dual declaration already drifts and will only get worse as mods grow.

**Group by domain with flat + nested support.** Co-located mods supporting both `index.ts` at root (flat) and `frontend/index.ts` (nested). Rejected the nested variant because it recreates the runtime split one level deeper — mods should organize by domain concern, not by runtime.

**`core/` vs `src/` as the top-level directory.** `src/` chosen because it's standard monorepo convention and avoids collision with the existing `frontend/src/core/` directory.

## Consequences

- Both frontend and backend loaders now read `modManifest.json` instead of inline `meta`/`manifest` exports
- Backend `INSTALLED_APPS` is populated programmatically by the loader, not maintained manually
- Root-level config is thin: `package.json` delegates to `src/shell/`, `docker-compose.yml` paths updated
- External mod installation mechanism is deferred to a separate PR
