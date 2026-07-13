# Backend Mod System Design

> Date: 2026-07-13
> Status: Spec published — see [Issue #208](https://github.com/TimHoogervorst/Helix/issues/208)
> Companion to: [Actions System Design](actions-system-design.md), [Mod System Architecture](mod-system.md), [Cross-Cutting Events](cross-cutting-events.md), [Grilling Alignment](grilling-alignment.md)
>
> This document captures the proposed architecture for bringing the backend mod system up to the same standard as the frontend.

---

## Table of Contents

1. [Current State vs. Frontend](#current-state-vs-frontend)
2. [Design Goals](#design-goals)
3. [Grilling Topic A: Backend Mod Manifest](#grilling-topic-a-backend-mod-manifest)
4. [Grilling Topic B: Backend Service Registry](#grilling-topic-b-backend-service-registry)
5. [Grilling Topic C: Unified Registration API](#grilling-topic-c-unified-registration-api)
6. [Grilling Topic D: Backend Platform SDK](#grilling-topic-d-backend-platform-sdk)
7. [Grilling Topic E: Discovery & Loading](#grilling-topic-e-discovery--loading)
8. [Grilling Topic F: External Mod Contract](#grilling-topic-f-external-mod-contract)
9. [Rollout Approach](#rollout-approach)

---

## Current State vs. Frontend

The frontend mod system is deliberate, validated, and consistent. The backend mod system is mostly just Django conventions. Here's the gap:

| Concern | Frontend | Backend |
|---|---|---|
| **Mod identity** | `meta = { id, displayName, dependsOn }` exported from each mod's `index.ts` | Nothing. Mods are just Django apps in `INSTALLED_APPS`. |
| **Dependency ordering** | Topological sort in `ModLoader`, cycle detection, missing-dep detection | None. `INSTALLED_APPS` order is manual. Signal connections depend on accidental ordering. |
| **Discovery** | Auto-glob `core-mods/*/index.ts` at build time | Manual listing in `INSTALLED_APPS`. |
| **Registration API** | 8 `register*()` functions → singleton `ModRegistry` | Ad-hoc per concern: `register_action_model()`, model rows for entity types, signal connections in `ready()`. No unified registry. |
| **Cross-mod communication** | `registerService()` / `registry.call()` — direct imports between mods forbidden | Direct imports everywhere: `lims/apps.py` imports from `eln.models`, `eln/serializers.py` imports from `tags.serializers`. |
| **Platform SDK** | `shared/` — `BaseCard`, `StatusBadge`, `Breadcrumbs`, hooks, types | Near-empty `shared/` — `pagination.py`, `permissions.py`. Everything else lives in `core/` with no clear boundary. |
| **Validation** | `registry.validate()` — cross-references checked at boot | No validation. Route conflicts, missing dependencies, duplicate registrations caught at runtime or not at all. |
| **Versioning** | None on either side | — |
| **External mod contract** | Designed (same `register*()` API, `@helix/core` npm package, `helix.mods.json`) | Not designed. External backend mods would need a contract for models, URLs, migrations, settings. |

---

## Design Goals

1. **Parity with the frontend.** A mod author should find the same concepts on both sides: a manifest, dependency ordering, a registration API, a service registry, and a platform SDK.

2. **Pit of success.** Registering a mod, declaring dependencies, and wiring into cross-cutting concerns should be mechanical — follow the pattern, it works.

3. **External-mod ready.** The design must anticipate external mods installed via a package manager (`pip`), listed in a config file, loaded after core mods, with the same API.

4. **Incremental.** The current system works. We don't need a big-bang rewrite. Each piece can be added incrementally and adopted by mods one at a time.

5. **Builds on Django, doesn't fight it.** Django already provides `AppConfig`, `INSTALLED_APPS`, signals, migrations, URL routing. The mod system is a layer on top that adds structure, validation, and a consistent API — not a replacement.

---

## Grilling Topic A: Backend Mod Manifest

**Every backend mod declares what it is, what it depends on, and what it provides.**

### Strawman Design

Each mod gets a `mod.py` (or extends `__init__.py`) with a manifest:

```python
# core_mods/eln/mod.py
from core.mod_system import ModManifest

manifest = ModManifest(
    id="eln",
    display_name="Electronic Lab Notebook",
    version="0.1.0",
    depends_on=["lims", "tags"],  # Must load after these
)
```

The manifest matches the frontend `meta` shape exactly: `id`, `display_name`, `version`, `depends_on`.

The manifest is read during boot. `INSTALLED_APPS` is built from it automatically (or validated against it).

### What `depends_on` Enforces

1. **Load ordering.** The dependency mod's `AppConfig.ready()` runs before the dependent's. This fixes the fragile signal connection ordering — LIMS can safely connect to ELN signals because it declares `depends_on=["eln"]`.

2. **Migration ordering.** Django's migration dependency graph can be validated against `depends_on` to catch missing foreign key targets at boot, not at migration time.

3. **Availability checking.** If a mod declares `depends_on=["lims"]` but LIMS is not installed, the system fails fast with a clear error.

### Key Questions to Grill

1. **`mod.py` vs. extending `AppConfig`?** Django already has `AppConfig`. Should the manifest be a new file, or additional attributes on the existing `ElnConfig` class?

2. **Is `depends_on` transitive?** If ELN depends on LIMS and LIMS depends on tags, does ELN implicitly depend on tags? (The frontend says no — each mod declares its own direct dependencies.)

3. **What happens when a dependency is missing?** Fail-fast at boot (like the frontend)? Graceful degradation? Admin-displayed warning?

4. **Does `provides` get validated?** → `provides` has been removed from the design. The registry is the single source of truth for what a mod provides. What a mod registers is what it provides. See [cross-cutting-events.md](cross-cutting-events.md).

5. **Version compatibility.** If mod A depends on mod B >= 1.2.0, how is that declared and checked? Is it needed yet, or is this YAGNI for now?

---

## Grilling Topic B: Backend Service Registry

**Mods communicate through a registry, not direct imports.**

### The Current Problem

```python
# lims/apps.py — imports directly from eln.models
from core_mods.eln.models import NotebookEntry

# eln/serializers.py — imports directly from tags.serializers
from core_mods.tags.serializers import TagSerializer
```

This creates hidden coupling. If the tags mod moves `TagSerializer`, the ELN mod breaks at import time. If the ELN mod's model changes, LIMS might break in non-obvious ways.

The frontend solves this with `registerService()` / `registry.call()`:

```typescript
// LIMS registers a service
registerService({ id: "lims.resolveEntity", handler: (id) => api.getEntity(id) });

// ELN calls it — no direct import
const entity = await registry.call("lims.resolveEntity", displayId);
```

### Strawman Design for the Backend

```python
# core/mod_system/registry.py
class BackendModRegistry:
    _services: dict[str, Callable] = {}

    def register_service(self, service_id: str, handler: Callable):
        self._services[service_id] = handler

    def call(self, service_id: str, *args, **kwargs):
        handler = self._services.get(service_id)
        if handler is None:
            raise ServiceNotFoundError(service_id)
        return handler(*args, **kwargs)

registry = BackendModRegistry()
```

```python
# lims/apps.py — LIMS registers a service
from core.mod_system import registry

class LimsConfig(AppConfig):
    def ready(self):
        from core_mods.lims.services import resolve_entity
        registry.register_service("lims.resolve_entity", resolve_entity)
```

```python
# eln/sync.py — ELN calls it, no direct import from lims
from core.mod_system import registry

def sync_entry_content(entry, old_content=None):
    entities = registry.call("lims.resolve_entities_from_content", entry.content)
```

### What Services Replace

Not every cross-mod import needs to be a service. The goal is to replace **behavioral** imports (calling another mod's code) while keeping **data** imports (using another mod's model class as a FK target) as direct imports — Django requires those.

| Import type | Mechanism |
|---|---|
| **Behavioral** — "do something in another mod" | Service registry |
| **Data/model** — "this FK points to your model" | Direct import (Django requirement) |
| **Shared types/interfaces** — "I use your serializer/constant" | Platform SDK (`core.shared` or `helix_core`) |

### Key Questions to Grill

1. **What's the boundary?** Which cross-mod imports MUST go through the registry vs. which are fine as direct imports? A clear rule prevents the registry from becoming a bloated abstraction layer.

2. **Service return types (RESOLVED).** Services never return ORM objects. They return platform SDK types (from `helix_core` in Phase 4) or plain dicts. Never Django model instances — that's hidden coupling behind a string lookup. See [cross-cutting-events.md](cross-cutting-events.md).

3. **Async services.** Some services might be I/O bound (querying the database). Are all services sync? Async? Both?

4. **Service discovery.** How does a mod author know what services are available? Auto-generated docs from registered services? A `registry.list_services()` introspection method?

5. **Testing.** When testing a mod that calls a service, how do you mock/stub the service? Does the registry support test overrides? (e.g., `registry.override("lims.resolve_entity", mock_handler)` as a context manager). This is deferred to the external mod design (Phase 8), but `override()` should ship with Phase 7.

---

## Grilling Topic C: Unified Registration API

**One consistent pattern for how mods register with cross-cutting concerns.**

### Current Inconsistency

Each cross-cutting concern on the backend invented its own registration mechanism:

| Concern | How mods register | Example |
|---|---|---|
| Action models | `register_action_model("eln", ElnAction)` | Function call in `AppConfig.ready()` |
| Entity types | `RegisteredEntityType.objects.create(...)` | Data row — NOT in `ready()`, triggered elsewhere |
| Signals | `post_save.connect(handler, sender=Model)` | In `AppConfig.ready()` |
| URL routes | `urlpatterns` in `config/urls.py` | Manual listing in root conf |
| Settings | `CoreSetting.objects.create(key="...", value=...)` | Data row, ad-hoc |

A mod author has to learn each pattern separately. There's no single "this is how you register things" answer.

### Strawman Design

A unified registry that follows the frontend's `register*()` pattern:

```python
# core/mod_system/registry.py
class BackendModRegistry:
    # ── Action models ──
    def register_action_model(self, mod_id: str, model_class: type): ...

    # ── URL routes ──
    def register_urls(self, mod_id: str, url_patterns: list): ...

    # ── Settings keys ── (not UI sections — see note below)
    def register_setting(self, mod_id: str, key: str, default: Any, **kwargs): ...

    # ── Services ──
    def register_service(self, service_id: str, handler: Callable): ...

    # ── Entity types (for mention resolution) ──
    def register_entity_type(self, config: EntityTypeConfig): ...

    # ── Signals / event listeners ──
    def register_signal(self, signal: Signal, handler: Callable, sender: type): ...
```

Each mod's `AppConfig.ready()` becomes a consistent sequence of `registry.register_*()` calls:

```python
class ElnConfig(AppConfig):
    def ready(self):
        registry = get_registry()

        # Register what I own
        registry.register_action_model("eln", ElnAction)
        registry.register_urls("eln", eln_urlpatterns)
        registry.register_entity_type(EntityTypeConfig(
            prefix="E", entity_type="eln_entry", workspace_id="eln",
        ))

        # Register what I listen to
        registry.register_signal(post_save, my_handler, sender=NotebookEntry)
```

### Key Questions to Grill

1. **All-in-one registry vs. per-concern registries?** The frontend has one `ModRegistry` with methods for each concern. The backend currently has separate registries (`actions/registry.py` for actions, `RegisteredEntityType` model for entity types). Merge or keep separate?

2. **Does the registry replace Django's URL conf?** Or does it feed into it? The registry collects URL patterns; `config/urls.py` reads from the registry instead of listing each mod manually.

3. **Settings registration.** The frontend has `registerSettingsSection()` which registers a React component (UI shell). The backend has `CoreSetting` key-value pairs (data). These are different concerns — the backend method is named `register_setting()` (singular, matching `CoreSetting`) to avoid implying it registers UI. Should backend mods register typed settings with validation, not just freeform JSON?

4. **Backward compatibility.** The existing `register_action_model()` function exists and is called in 2 mods. Does the unified registry deprecate the standalone function, or wrap it?

5. **Action type naming convention.** Per [cross-cutting-events.md](cross-cutting-events.md), action types use the triple-dotted `"{mod}.{target}.{verb}"` convention (e.g., `"eln.entry.created"`). This is the same string used on the frontend event bus, in the action log DB column, and in ActivityFeed subscriptions. The registry doesn't enforce this — it's a convention, not a constraint — but `register_action_model()` consumers should follow it. Existing rows with short verbs (`"created"`, `"edited"`) are a migration concern owned by the actions system design, not the mod system.

---

## Grilling Topic D: Backend Platform SDK

**What mods import from — the backend equivalent of `shared/` and `@helix/core`.**

### Current State

```
backend/
├── core/              # App shell + de facto SDK (mixed)
│   ├── abstracts.py   # BrowsableItem — SDK
│   ├── actions/       # AbstractBaseAction, log_action — SDK
│   ├── models.py      # User, Folder, CoreSetting — shell
│   └── ...
└── shared/            # Meant to be the SDK, but near-empty
    ├── pagination.py
    └── permissions.py
```

`core/` serves double duty: it's both the Django app that owns `User`/`Folder` (shell) AND the place mods import `BrowsableItem`/`log_action` from (SDK). The boundary is clear to the team but not to the code.

### Strawman Design

Split `core/` into two layers:

```
backend/
├── helix_core/            # Platform SDK — what mods import
│   ├── abstracts.py       # BrowsableItem
│   ├── actions/           # AbstractBaseAction, log_action, registry
│   ├── mixins/            # ActionLoggingMixin, etc.
│   ├── pagination.py
│   ├── permissions.py
│   └── mod_system/        # BackendModRegistry, ModManifest
│
├── core/                  # Shell app — User, Folder, CoreSetting
│   ├── models.py
│   └── ...
│
└── core_mods/             # Mods import from helix_core, not directly from each other
    ├── eln/
    ├── lims/
    └── ...
```

This makes the external mod contract explicit: `helix_core` is what ships as a `pip` package. `core` is internal shell. Mods depend on `helix_core`.

### Key Questions to Grill

1. **Is a separate package worth it now?** The current setup works. The split pays off when external mods arrive. Do we split now (proactive) or later (YAGNI)?

2. **What goes in the SDK vs. stays in the mod?** `AbstractBaseAction` is clearly SDK. What about `Tag` model? If tags are a mod, and ELN needs to reference tags, does the tag model class live in the SDK? That breaks the mod boundary.

3. **Naming.** `helix_core`? `helix_sdk`? `openscience_core`? Match the frontend's planned `@helix/core`?

4. **Django app or plain Python package?** If `helix_core` contains abstract models, it might need to be a Django app so migrations work. If it's just utilities and ABCs, a plain package suffices.

---

## Grilling Topic E: Discovery & Loading

**How the system knows which mods exist and in what order to load them.**

### Current State

- **Frontend:** Auto-glob `core-mods/*/index.ts` at build time. External mods: future `helix.mods.json`.
- **Backend:** Manual `INSTALLED_APPS` list in `settings.py`. No discovery.

### Strawman Design

```python
# config/settings.py
HELIX_MODS = [
    "core_mods.tags",
    "core_mods.lims",
    "core_mods.eln",
    "core_mods.library",
    "core_mods.pins",
    "core_mods.users",
]

# The mod system reads HELIX_MODS, reads each mod's manifest,
# topologically sorts, and builds INSTALLED_APPS.
```

For external mods:

```python
# helix.mods.json (or similar)
{
  "external_mods": [
    {"package": "helix_mod_inventory", "enabled": true},
    {"package": "helix_mod_signatures", "enabled": false}
  ]
}
```

The loader:
1. Reads `HELIX_MODS` for core mods
2. Reads `helix.mods.json` for external mods
3. Reads each mod's manifest (`mod.py` or `AppConfig` attributes)
4. Extracts `depends_on`, topologically sorts
5. Validates: no cycles, no missing deps, no duplicate IDs
6. Builds `INSTALLED_APPS` in sorted order
7. Proceeds with normal Django boot

### Key Questions to Grill

1. **`HELIX_MODS` vs. keeping `INSTALLED_APPS`?** Does the mod system replace `INSTALLED_APPS` or supplement it? Django will still need non-mod apps listed (admin, rest_framework, etc.).

2. **Auto-discovery or explicit listing?** The frontend uses auto-glob for core mods (explicit listing only for external). Should the backend do the same? `importlib` can discover packages under `core_mods/`.

3. **What happens when a mod fails to load?** Fail-fast like the frontend? Skip the mod and continue with a warning? Admin-visible error?

4. **Hot-reloading during development?** The frontend has HMR via Vite. The backend has Django's auto-reloader. Does the mod loader need to work with Django's reloader?

---

## Grilling Topic F: External Mod Contract

**What an external mod author needs to provide, and what they can depend on.**

### What an External Backend Mod Looks Like

```python
# helix-mod-inventory/helix_mod_inventory/mod.py
from helix_core.mod_system import ModManifest

manifest = ModManifest(
    id="inventory",
    display_name="Inventory Management",
    version="1.0.0",
    depends_on=["lims"],
)
```

```python
# helix-mod-inventory/helix_mod_inventory/apps.py
from django.apps import AppConfig
from helix_core.mod_system import registry

class InventoryConfig(AppConfig):
    name = "helix_mod_inventory"

    def ready(self):
        from .models import InventoryAction
        registry.register_action_model("inventory", InventoryAction)
        registry.register_urls("inventory", inventory_urlpatterns)
```

### The Contract

An external mod:
- **Provides:** a `mod.py` with a `ModManifest`, an `AppConfig` subclass
- **Imports from:** `helix_core` (the pip package) — `BrowsableItem`, `AbstractBaseAction`, `log_action`, `ModManifest`, `registry`
- **Registers via:** the unified `registry.register_*()` API
- **Is discovered via:** `helix.mods.json` or a Python entry point
- **Must not:** import directly from `core/` or from other mods (use the service registry for behavioral calls)

### Key Questions to Grill

1. **Database migrations from external mods.** Django migrations work per-app. External mods bring their own migrations. How are they run? `manage.py migrate` picks them up automatically if the app is in `INSTALLED_APPS`.

2. **Schema isolation.** The user mentioned interest in per-mod database schemas. If each mod gets its own PostgreSQL schema, how does that affect FK relationships across mods? (Django doesn't natively support cross-schema FKs.)

3. **Static files / assets.** If an external mod ships frontend assets (React components), how are they served? The frontend external mod system handles this via npm — the backend only serves API responses.

4. **Testing contract.** What test infrastructure does `helix_core` provide? Test base classes? Factories? A test registry that resets between tests?

5. **Admin integration.** If an external mod registers models with Django admin, does the admin auto-discover them? Yes — Django handles this. But is the admin the right UI for external mods?

---

## Rollout Approach

The goal is incremental adoption, not a big-bang rewrite. The Platform SDK (`helix_core`) is created in Phase 1 so the manifest, registry, and SDK types are built in their final location from day one — zero migration work later.

### Phase 1: Platform SDK + Backend Mod Manifest (foundation)

- Create `helix_core/` as a Django app (needed for abstract models: `BrowsableItem`, `AbstractBaseAction`)
- Move existing SDK-shaped code from `core/` into `helix_core/`: `abstracts.py`, `actions/` (base, registry, logger), `pagination.py`, `permissions.py`
- Add `ModManifest` to `helix_core/mod_system/` — `id`, `display_name`, `version`, `depends_on`
- Each core mod gets a `mod.py` with its manifest
- `HELIX_MODS` setting replaces the helix portion of `INSTALLED_APPS`
- Loader reads manifests via auto-discovery (`core_mods/*/mod.py`), topologically sorts, validates deps
- `INSTALLED_APPS` becomes: Django built-ins + third-party + `helix_core` + `core` + `get_helix_mods()`
- Existing behavior is unchanged — just now validated

**This alone fixes:** fragile signal ordering, undocumented dependencies, no boot validation, SDK/shell boundary blur.

### Phase 2: Unified Registry (consolidate what's already there)

- Build `BackendModRegistry` inside `helix_core/mod_system/`
- Move `register_action_model()` into it (deprecate standalone function)
- Add `register_urls()` so `config/urls.py` reads from the registry
- Add `register_entity_type()` to replace ad-hoc model row creation
- Add `register_setting()` to declare owned setting keys
- Mods update their `AppConfig.ready()` to use the unified registry

### Phase 3: Service Registry (replace direct cross-mod imports)

- Add `register_service()` / `registry.call()` to `BackendModRegistry`
- Add `registry.list_services()` for introspection
- Identify the ~5-10 cross-mod behavioral imports and convert them
- Document the rule: behavioral = service, data = direct import, shared = SDK

### Phase 4: External Mod Contract

- `helix.mods.json` for external mod discovery
- `helix_core` ships as a pip-installable package
- External mods use the same `mod.py` + `AppConfig` + `registry.register_*()` pattern
- `registry.override()` for external mod testing

---

## Open Questions

1. **How much ceremony is too much?** The frontend mod system is ~400 lines of loader + registry + validation. Adding a manifest, topological sort, registry methods, and service registry to the backend could double that. Is the value worth the complexity for 6 core mods? (Answer is likely: yes, when external mods arrive. The question is timing.)

2. **Does this fight Django's philosophy?** Django's philosophy is "explicit is better than implicit." `INSTALLED_APPS` is explicit. A manifest that auto-builds `INSTALLED_APPS` adds a layer of magic. Does the team value the validation and structure more than Django's explicitness?

3. **What about the existing frontend `shared/` drift?** The actions system work will move `ActivityFeed` and `useActivity` to `shared/`. That's a good forcing function to align the docs with reality. The backend SDK extraction (`helix_core`) happens in Phase 1, before the frontend shared/ consolidation (Phase 6 overall). The two are decoupled — different codebases, different timelines. Naming is already aligned (`helix_core` ↔ `@helix/core`).

4. **Per-mod database schemas.** The user mentioned interest in giving each mod its own PostgreSQL schema. This is a significant architectural decision that affects the platform SDK, cross-mod FK relationships, and migration strategy. It should be its own design doc and grilling session.

---

## References

- [Mod System Architecture](mod-system.md) — frontend mod system this design aims to mirror
- [Actions System Design](actions-system-design.md) — first cross-cutting concern built on the new backend mod system
- [backend/core/actions/registry.py](../backend/core/actions/registry.py) — current ad-hoc registration pattern
- [backend/config/settings.py](../backend/config/settings.py#L18-L40) — current `INSTALLED_APPS` listing
- [backend/config/urls.py](../backend/config/urls.py) — current manual URL aggregation
