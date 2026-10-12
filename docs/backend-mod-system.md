# Backend Mod System

> Date: 2026-07-16
> Status: Accepted
> Companion to: [Mod System Architecture](mod-system.md), [Slot System & Event Bus](slot-system.md), [Actions System Design](actions-system-design.md)
>
> This document captures the design for the backend mod system — the `helix_core` SDK, mod manifest loading, unified backend registry, service registry, and external mod contract.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Architecture Overview](#architecture-overview)
3. [Mod Manifest](#mod-manifest)
4. [Mod Discovery & Loading](#mod-discovery--loading)
5. [BackendModRegistry](#backendmodregistry)
6. [Service Registry](#service-registry)
7. [Platform SDK (`helix_core`)](#platform-sdk-helix_core)
8. [URL Routing](#url-routing)
9. [External Mod Contract](#external-mod-contract)
10. [Cross-Cutting Concerns](#cross-cutting-concerns)

---

## Problem Statement

The frontend mod system was deliberate and validated — every mod declares a manifest, loads in topological order, registers through a unified API, and communicates via a service registry. The backend had no equivalent structure. There was no mod identity, no dependency validation, no unified registration API, and cross-mod communication happened through direct imports creating hidden coupling.

A backend mod author had no single answer to "how do I register my mod, declare what it depends on, and wire into cross-cutting concerns?" Each concern invented its own mechanism. Adding a new mod meant touching `settings.py`, `urls.py`, and remembering which import pattern each cross-cutting concern expected.

---

## Architecture Overview

```
src/
├── helix_core/                        # Platform package and Django apps
│   ├── mod_system/                    # Loader, registry, manifest
│   ├── core/                          # Preserved `core` app label
│   └── mentions/                      # Preserved `mentions` app label
│
├── bundled/                           # Closed, explicitly enumerated Bundled Mods
│   ├── shared/
│   │   ├── home/
│   │   ├── library/
│   │   └── entities/
│   ├── lims/
│   └── ...
│
├── mods/                              # External-only Mods
│   ├── eln/
│   │   ├── modManifest.json           # Single identity source of truth
│   │   ├── index.ts                   # Frontend register*() entry point
│   │   ├── mod.py                     # Backend mod identity + register*() entry point
│   │   ├── models.py                  # Django models (NotebookEntry, Tag, etc.)
│   │   ├── views.py                   # DRF viewsets
│   │   ├── serializers.py
│   │   ├── urls.py                    # Mod URL patterns
│   │   ├── admin.py
│   │   ├── migrations/                # Django migrations
│   │   └── tests/                     # Backend tests
│   │
│   ├── lims/
│   │   ├── modManifest.json
│   │   ├── index.ts
│   │   ├── mod.py
│   │   ├── models.py                  # EntityType, Entity, Action, RegisteredEntityType
│   │   ...
│   │
│   └── ... (other mods follow same pattern)
│
├── shell/                             # Frontend React project (Vite)
│   └── src/
│       ├── mod-system/                # Frontend mod loader + registry
│       └── ...
│
└── server/                            # Django project configuration only
    ├── config/                        # settings.py, wsgi.py, root urls.py
    └── manage.py
```

---

## Mod Manifest

`modManifest.json` is the single source of truth for mod identity, read by both frontend and backend loaders. It lives at the root of each mod folder under `src/bundled/` or `src/mods/`.

### Schema

```json
{
  "id": "eln",
  "displayName": "Electronic Lab Notebook",
  "version": "0.1.0",
  "requiresHelix": ">=1.0.0",
  "artifacts": ["backend"],
  "dependsOn": [{"id": "helix.lims", "version": "^1.0.0"}],
  "description": "Rich-text electronic lab notebook with TipTap editor"
}
```

| Field | Required | Purpose |
|-------|----------|---------|
| `id` | ✅ | Globally unique mod identifier. Used for directory name, URL namespace, and dependency references. Convention: lowercase, single word or hyphenated. |
| `displayName` | ✅ | Human-readable name shown in mod listing screens. |
| `version` | ✅ | Semver version string. |
| `requiresHelix` | ✅ | npm-compatible SemVer range for the Helix platform. |
| `artifacts` | ✅ | Non-empty unique subset of `frontend` and `backend`. |
| `dependsOn` | ✅ | Array of `{id, version}` objects; string shorthand is invalid. |
| `description` | No | Short description for settings and mod listing screens. |

### What the manifest does NOT describe

The manifest is an **identity document**, not a capability declaration. It does NOT describe:
- Routes or URLs (discovered from `registerRoute()` calls)
- Editor blocks (discovered from `registerBlock()` calls)
- Settings panels (discovered from `registerSettingsSection()` calls)
- API endpoints (discovered from Django URL patterns)

Capabilities are discovered at boot from registration calls — the manifest is purely "who are you and what do you need."

---

## Mod Discovery & Loading

### Backend Loader (`helix_core/mod_system/loader.py`)

The backend loader loads the closed Bundled Mod set from `BUNDLED_MODS`, discovers External Mods from `src/mods/` and `helix.mods.json`, validates dependencies, and populates `INSTALLED_APPS` programmatically.

```
Django startup (AppConfig.ready)
  → ModLoader.discover()
       1. Load explicit Bundled Mod paths from `helix_core.mod_system.bundled`
       2. Discover External Mods from `src/mods/` and `helix.mods.json`
       3. Parse each manifest → ModManifest dataclass
       4. Topological sort by dependsOn
       5. Validate:
         - No duplicate IDs
         - No circular dependencies
         - No missing dependencies
         - coreVersion constraints satisfied
       6. Build INSTALLED_APPS list:
          - helix_core (always first)
          - helix_core.core and helix_core.mentions (preserved app labels)
          - Bundled and External Mods in dependency order
      7. Import each mod's mod.py → call register() function
         → Mod populates BackendModRegistry
      8. Validate registry: all references resolve
  → Django continues normal startup with computed INSTALLED_APPS
```

### mod.py Contract

Every backend mod provides a `mod.py` at its root with a `register()` function. This is the **canonical registration entry point** — mods register all backend concerns here, not in `apps.py`:

```python
# src/bundled/lims/mod.py
from helix_core.mod_system.registry import registry

def register():
    """Called by ModLoader after topological sort. Populates the backend registry."""
    registry.register_schema_type(
        mod_id="lims", display_name="Entity",
        workspace_id="lims", prefix="BLOOD", columns=[...],
    )
    registry.register_action_model("lims", LimsAction)
    registry.register_custom_action(
        mod_id="lims", action_id="lims.sample.registered",
        label="Sample Registered", core="edited",
        target_model="bundled.lims.models.Entity",
    )
    registry.register_urls("lims", "bundled.lims.urls")
```

The `register()` function is the backend equivalent of the frontend `index.ts` — it calls imperative registration functions to declare what the mod provides.

### Bundled and External sources

```python
# src/server/config/settings.py
HELIX_MODS = None
# None loads the explicit `BUNDLED_MODS` list and then open External discovery.
# A list of dotted paths is available for focused backend tests and overrides
# the bundled list; external entries in helix.mods.json are still loaded.
```

External Mods are currently discovered from the `mods/` package and optional
`helix.mods.json` path entries. The pip-installable package contract is future
work; the discovery asymmetry is intentional and documented in ADR-0029.

---

## BackendModRegistry

The unified registry for backend mod contributions. One `BackendModRegistry` singleton, populated by `mod.py` `register()` calls, read by Core to wire up the application.

### Registration Methods

```python
class BackendModRegistry:
    """Unified backend registry — the single API for mod contributions."""

    def register_schema_type(self, mod_id: str, display_name: str,
                            workspace_id: str, prefix: str,
                            columns: list[dict] = None) -> None:
        """Register a schema type — the backend authority for workspace identity."""

    def register_action_model(self, mod_id: str, model_class: type) -> None:
        """Register a concrete action log model. Auto-derives core CRUD actions."""

    def register_custom_action(self, mod_id: str, action_id: str,
                               label: str, core: str,
                               target_model: str) -> None:
        """Register a custom domain action that maps to a core action.
        core must be one of: 'created', 'edited', 'deleted'."""

    def register_urls(self, mod_id: str, url_module: str) -> None:
        """Register a mod's URL patterns for inclusion in the root URL conf."""

    def register_settings(self, mod_id: str, settings_keys: list[str]) -> None:
        """Register settings keys a mod requires (validated at startup)."""

    def register_signal(self, mod_id: str, signal_name: str,
                        handler: Callable) -> None:
        """Register a signal handler for cross-mod event wiring."""

    def register_service(self, mod_id: str, service_id: str,
                         handler: Callable) -> None:
        """Register a callable service for cross-mod communication."""

    # Read accessors
    def call(self, service_id: str, *args, **kwargs) -> Any: ...
    def get_url_modules(self) -> list[str]: ...
    def get_action_models(self) -> dict[str, type]: ...
    def get_registry_payload(self) -> dict:
        """Return JSON-serializable dict of all registered data for GET /api/mod-registry/."""
    def get_action_catalog(self, mod_id: str) -> list[dict]:
        """Return all registered actions (core + custom) for a mod."""
    def validate_action(self, action_type: str) -> bool:
        """Check whether an action type is in the registered catalog."""
```

| Method | Purpose | Example |
|--------|---------|---------|
| `register_schema_type()` | Register a schema type (display name, prefix, columns, workspace identity) | `registry.register_schema_type("lims", display_name="Entity", ...)` |
| `register_action_model()` | Register a mod's concrete action log model | `registry.register_action_model("eln", ElnAction)` |
| `register_custom_action()` | Register a custom domain action that maps to a core action | `registry.register_custom_action("lims", "lims.sample.registered", ...)` |
| `register_urls()` | Register URL patterns for root URL conf | `registry.register_urls("lims", "bundled.lims.urls")` |
| `register_settings()` | Declare settings keys the mod needs | `registry.register_settings("eln", ["ELN_MAX_TAGS"])` |
| `register_signal()` | Wire cross-mod signal handlers | `registry.register_signal("eln", "entry_saved", handler)` |
| `register_service()` | Register a callable cross-mod service | `registry.register_service("lims", "resolve_entity", handler)` |

### Mod Registry API Endpoint

`GET /api/mod-registry/` returns all backend-owned mod data to the frontend at boot time. The response is a JSON object keyed by `mod_id` with workspace IDs, schema types (id, displayName, prefix, columns), and action catalogs (core + custom actions with their `core` mapping).

---

## Service Registry

Cross-mod communication goes through the service registry — mods never import directly from each other.

```python
# LIMS registers a service
# In src/bundled/lims/mod.py
def register():
    registry.register_service("lims", "resolve_entity", resolve_entity_handler)

# ELN calls it
# In src/mods/eln/views.py
from helix_core.mod_system.registry import registry
entity = registry.call("lims.resolve_entity", display_id="DNA34")
```

**Rules:**
- Services are registered in `mod.py` `register()` during boot
- Services are called via `registry.call()` — never imported directly
- Service IDs use the format `"{mod_id}.{service_name}"`
- Errors from services propagate to the caller (no silent swallowing)
- Calling an unregistered service raises `ServiceNotFoundError`

---

## Platform SDK (`helix_core`)

`helix_core` is the dedicated Platform SDK package living at `src/helix_core/`. It provides:

| Module | Purpose |
|--------|---------|
| `mod_system/loader.py` | Bundled enumeration, External discovery, topological sort, `INSTALLED_APPS` computation |
| `mod_system/registry.py` | `BackendModRegistry` singleton — all `register_*()` methods + `call()` |
| `mod_system/manifest.py` | `ModManifest` dataclass — parses `modManifest.json` |
| `actions.py` | `AbstractBaseAction` model, `ActionLoggingMixin`, `@logs_action` decorator |
| `exceptions.py` | `ModNotFoundError`, `CircularDependencyError`, `ServiceNotFoundError` |

**Import boundary:** External mods import from `helix_core` — never the other way around. `helix_core` has zero dependencies on any mod.

Generated references for the current SDK are available in the [Python API reference](generated/python-api.md) and [validator diagnostics reference](generated/validator-diagnostics.md). Human packaging guidance is in [External Mod Packaging](mod-packaging.md). The permanent hello-world tutorial and golden fixture is [`src/mods/hello_world`](../src/mods/hello_world).

---

## URL Routing

Mods register URL patterns through the registry; the root URL conf aggregates them:

```python
# src/server/config/urls.py
from helix_core.mod_system.registry import registry

urlpatterns = [
    path("api/core/", include("helix_core.core.urls")),
    path("api/mentions/", include("helix_core.mentions.urls")),
    path("api/", include("helix_core.urls")),     # Actions API
    # Mod URLs auto-registered:
    *[path("api/", include(mod_url)) for mod_url in registry.get_url_modules()],
    path("admin/", admin.site.urls),
]
```

Each mod's `urls.py` defines its API endpoints under its namespace:

```python
# src/bundled/lims/urls.py
urlpatterns = [
    path("lims/entities/", EntityViewSet.as_view({"get": "list", "post": "create"})),
    path("lims/entity-types/", EntityTypeViewSet.as_view({"get": "list", "post": "create"})),
    ...
]
```

---

## External Mod Contract

External Mods use the same `modManifest.json` + `mod.py` + `register_*()` pattern as Bundled Mods. The contract:

1. **Package:** External Mods are packages under `src/mods/` for repository dogfood
2. **Entry point:** Installed backend artifacts advertise `helix.mods` with the canonical Mod ID as the entry-point name and package root as its value; repository packages retain `mod.py` fallback discovery
3. **Manifest:** `modManifest.json` at package root — same schema as Bundled Mods
4. **Registration:** `mod.py` `register()` function — same `register_*()` API
5. **Dependencies:** `dependsOn` in manifest — can depend on Bundled Mods or other External Mods
6. **Composition:** `helix.mods.json` can name an external `mod.py` path; `HELIX_MODS` remains a test/override seam

```python
# External Mod package (future distribution shape)
[options.entry_points]
helix_mod =
    molbio = molbio.mod
```

```json
{
  "mods": [{ "path": "./external_mods/molbio/mod.py" }]
}
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Identity source of truth | `modManifest.json` at mod root | Both frontend and backend loaders read the same file; no dual declaration |
| Manifest scope | Identity only (not capabilities) | Capabilities are discovered at boot from registration calls, not declared statically |
| Discovery | Explicit Bundled list plus open External discovery | Bundled contents are closed; deployment composition remains open |
| Loading order | Topological sort by `dependsOn` | Same algorithm as frontend; shared mental model |
| Registration style | Imperative (`register_*()` in `mod.py`) | Same pattern as frontend; flexible and testable |
| Error handling | Fail-fast | Broken dependency graph = no boot, error in terminal |
| Cross-mod communication | `registry.call()` | No direct imports between mods; same pattern as frontend |
| Frontend discovery of backend data | `GET /api/mod-registry/` endpoint | Frontend hydrates workspace IDs, schema types, and action catalogs from backend at boot |
| Registration entry point | `mod.py` `register()` function | Canonical single entry point for backend registration; replaces `apps.py` |
| Custom actions | `register_custom_action()` with core mapping | Every custom action maps to a core CRUD action; audit trail always clear |
| External mod discovery | `src/mods/` scan plus `helix.mods.json` | Open repository and deployment composition path; packaged entry points remain future work |
| `INSTALLED_APPS` | Computed programmatically | No manual maintenance; reflects Platform, Bundled, and External dependency order |
