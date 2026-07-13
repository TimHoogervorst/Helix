# Cross-Cutting Events & Design Reconciliation

> Date: 2026-07-13
> Status: Draft — reconciliation doc tying together the mod system, slot system, actions system, and backend mod system designs
>
> **Purpose:** This doc captures the decisions that span multiple design docs so they don't drift apart. It is the single reference for naming conventions, communication patterns, and boundary rules. Each grilling session for an individual doc should consult this doc first.

---

## Table of Contents

1. [Implementation Order](#implementation-order)
2. [Event Naming Convention](#event-naming-convention)
3. [Block Lifecycle → Action Logging Path](#block-lifecycle--action-logging-path)
4. [Service Return Type Boundary](#service-return-type-boundary)
5. [Listener Patterns](#listener-patterns)
6. [Manifest Version Field](#manifest-version-field)
7. [What `provides` Is Not](#what-provides-is-not)
8. [Forward References](#forward-references)

---

## Implementation Order

```
Phase 1: Platform SDK + Backend Mod Manifest (#207 Phase 1)
   │  Create helix_core Django app, move AbstractBaseAction/BrowsableItem/log_action
   │  ModManifest, mod.py per mod, HELIX_MODS, auto-discovery, topological sort
   │
Phase 2: Unified Backend Registry (#207 Phase 2)
   │  BackendModRegistry inside helix_core/mod_system/
   │  Depends on: Phase 1 (helix_core exists, manifest system running)
   │
Phase 3: Declarative Action Logging — Mixins (#206)
   │  Backend-only: ActionLoggingMixin, metadata auto-capture
   │  Depends on: BackendModRegistry existing (Phase 2)
   │
Phase 4: Slot System + Workspace Event Bus (#205)
   │  Frontend-only: declareSlot(), registerIntoSlot(), SlotRenderer, WorkspaceBus
   │  Depends on: nothing (additive to existing ModRegistry)
   │
Phase 5: Block-Declared Actions (#206 Phase 3, reconciled)
   │  BlockConfig gains messages, getDisplayName
   │  Editor emits lifecycle events on bus (framework, not block author)
   │  Workspace shell wires action-logging listener
   │  Depends on: Phase 3 (backend action endpoint) + Phase 4 (event bus)
   │
Phase 6: Cross-Mod ActivityFeed (#206 Phase 4)
   │  Move ActivityFeed to shared/ as a generic component
   │  Registers as ComponentSlotContent into sidebar slots
   │  Subscribes to events via bus.on()
   │  Depends on: Phase 4 (slot system) + Phase 5 (event naming)
   │
Phase 7: Backend Service Registry (#207 Phase 3)
   │  register_service() / registry.call()
   │  Convert ~5-10 direct cross-mod imports
   │  registry.list_services() for introspection
   │  Depends on: Phase 2 (unified registry)
   │
Phase 8: External Mod Contract (#207 Phase 4)
   │  helix.mods.json, pip packaging for helix_core
   │  External mods use same mod.py + AppConfig + register_*() pattern
   │  registry.override() for external mod testing
   │  Depends on: Phase 7 (services define the SDK boundary)
```

### Design Docs ↔ Phases

| Doc | Phases covered |
|-----|---------------|
| [backend-mod-system.md](backend-mod-system.md) | 1, 2, 7, 8 |
| [actions-system-design.md](actions-system-design.md) | 3, 5, 6 |
| [slot-system.md](slot-system.md) | 4, 5, 6 |
| [mod-system.md](mod-system.md) | Baseline (already implemented) |

> **Note:** Phase 1 now creates `helix_core` alongside the mod manifest — SDK code (`AbstractBaseAction`, `BrowsableItem`, `log_action`, pagination, permissions) moves from `core/` to `helix_core/` immediately so the manifest, registry, and SDK types are built in their final location from day one. Phase 8 is now external mod contract only (helix.mods.json, pip packaging, `registry.override()`).

---

## Event Naming Convention

**Rule: Triple-dotted `"{mod}.{target}.{verb_past}"` — used everywhere, frontend and backend.**

| Context | Example |
|---------|---------|
| Bus emission | `"eln.table.edited"` |
| Action log `action_type` column | `"eln.table.edited"` |
| ActivityFeed `bus.on()` subscription | `"eln.table.edited"` |
| Bus listener `listensTo` | `["data.export", "eln.entry.saved"]` |

The same string appears in three places: the bus, the database, and the UI subscription. No translation between event names and action types.

### Verbs

| Verb | Used for |
|------|----------|
| `created` | Record inserted, block mounted |
| `edited` | Record updated, block content changed |
| `deleted` | Record removed, block unmounted |
| `saved` | Entry save committed (distinct from `edited` — save is the persistence event) |
| `loaded` | Data fetched (not logged — read operation) |
| `saving` | Before persistence (not logged — pre-save hook) |

### Non-loggable events

Some events exist on the bus but don't produce action log rows. They use the same naming scheme. The action-logging listener checks the verb and skips non-loggable ones (`loaded`, `saving`, `mounted`, `unmounted`, `changed` for selection).

---

## Block Lifecycle → Action Logging Path

**Reconciled path** (supersedes the direct API call described in actions-system-design.md § Grilling Topic B):

```
ProseMirror transaction commits (block inserted/changed/removed)
    │
    ▼
Editor framework detects block node affected
    │
    ▼
Editor emits "{mod}.{block}.{verb}" on WorkspaceBus
  (framework-emitted, NOT block-emitted — block author never calls bus.emit())
    │
    ├──▶ Workspace shell's action-logging listener:
    │      - Receives event
    │      - Derives action_type from event name (same string)
    │      - Derives mod from block ID's first segment for routing to correct action table
    │      - Derives human-readable message from block's messages config or default template
    │      - POST /api/{mod}/entries/{entryId}/actions/ with { action_type, metadata }
    │
    ├──▶ ActivityFeed component (bus.on subscriber):
    │      - Optimistically prepends action to feed
    │      - Reconciles on next data fetch
    │
    └──▶ Future consumers (notifications, audit export, etc.)
```

### Action type derivation

Mechanical, zero-ceremony. Block author only provides `messages` overrides and `getDisplayName`.

```
Block ID: "eln.table"
Lifecycle event: block inserted → verb = "created"
Action type: "eln.table.created"
```

### Message derivation

```
Default template:   "{label} was {verb_past}"   → "Table was created"
With getDisplayName: "{label} '{displayName}' was {verb_past}" → "Table 'Samples' was created"
With messages override: uses custom string       → "spreadsheet was born"
```

### Which action table?

Derived from the block ID's first segment: `"eln.table"` → mod = `"eln"` → writes to `ElnAction` table. `"lims.data-table"` → mod = `"lims"` → writes to LIMS `Action` table. The workspace doesn't hardcode this — the derivation rule handles cross-mod blocks.

---

## Service Return Type Boundary

**Rule: Services never return ORM objects or mod-specific types across the boundary.**

| Return type | Mechanism | Example |
|-------------|-----------|---------|
| Platform SDK type | Import from `shared/` or `helix_core` | `EntitySummary`, `UserInfo`, `ActionItem` |
| Plain dict / POJO | No shared type yet — plain data | `{ id, name, status }` |
| ORM object | **Forbidden** — hidden coupling | — |

The platform SDK defines shared types for common patterns. Services that return novel shapes use plain dicts until the pattern proves itself, then graduate to the SDK.

**Frontend equivalent:** Interfaces live in `shared/`. `ActionItem` from actions-system-design.md § Grilling Topic D is already this pattern.

---

## Listener Patterns

Two patterns for subscribing to bus events. No `registerEventListener()` — not needed.

| Listener type | Mechanism | When to use |
|--------------|-----------|-------------|
| **Block** | Declarative: `listensTo` + `onEvent` in `BlockSlotContent` | Block reacting to other blocks or workspace events inside the editor |
| **Component** | Imperative: `bus.on(event, handler)` in `useEffect` | Any non-block component rendered in a slot (ActivityFeed, lock indicator, export button) |
| **Workspace shell** | Imperative: `bus.on()` during workspace setup | Cross-cutting concerns owned by the workspace (action logging, lock management) |

Blocks get declarative sugar because the editor framework needs to route events to them and manage their lifecycle. Components use standard React patterns.

---

## Manifest Version Field

**Rule: `version` is a required string field on both frontend `meta` and backend `ModManifest`.**

- **Phase 1:** Documentation-only. No parsing, no compatibility checks.
- **Future:** When external mods need version compatibility (`depends_on: [{ id: "lims", version: ">=1.2" }]`), the field already exists. No manifest format migration needed.

```typescript
// Frontend
export const meta = {
  id: "eln",
  displayName: "Electronic Lab Notebook",
  version: "0.1.0",
  dependsOn: ["lims", "tags"],
};
```

```python
# Backend
manifest = ModManifest(
    id="eln",
    display_name="Electronic Lab Notebook",
    version="0.1.0",
    depends_on=["lims", "tags"],
)
```

---

## What `provides` Is Not

**`provides` on `ModManifest` is removed from the design.** The registry is the single source of truth for what a mod provides. What a mod registers (`register_action_model()`, `register_urls()`, `registerIntoSlot()`, etc.) is what it provides. Declaring it redundantly in the manifest creates drift risk with no validation benefit.

The original strawman in backend-mod-system-design.md § Grilling Topic A included `provides` as a list of strings. This has been cut. The backend manifest is `id`, `display_name`, `version`, `depends_on` — matching the frontend `meta` shape exactly.

---

## Forward References

These are acknowledged gaps that need design, but are out of scope for the current round of docs. They are noted here so they aren't forgotten and so future grilling sessions can pick them up.

### Testing Infrastructure

When external mods are designed (Phase 8), the testing contract needs:

- **Backend service registry:** `registry.override(service_id, mock_handler)` as a context manager
- **Frontend workspace bus:** `createTestBus()` factory for unit tests
- **Action mixin:** Swappable adapter so tests can capture instead of writing to DB

These hooks should ship with their respective features (Phase 7 for `registry.override()`, Phase 4 for `createTestBus()`, Phase 3 for action mixin adapter). They are API decisions, not separate features — cheap to design in now, expensive to retrofit.

### Backend → Frontend Events

Server-initiated events (background task completes, another user edits the same entry, LIMS entity status changes) are out of scope for the workspace bus, which is scoped to a single browser tab. When WebSocket/Django Channels support is added, the event naming convention established here (`"{mod}.{target}.{verb_past}"`) should be used without modification.

### Notifications System

The actions doc (actions-system-design.md § Open Questions #5) notes that notifications ("User X commented on your entry") are related to action logging. The event bus is the natural integration point — a notification listener subscribes to the same lifecycle events the action-logging listener does. The action log is the record; the notification is the push. Same event, different listeners.

### Per-Mod Database Schemas

Backend mod isolation via PostgreSQL schemas is its own design doc and grilling session. It affects the platform SDK, cross-mod FK relationships, and migration strategy (backend-mod-system-design.md § Grilling Topic F, Q2).

---

## References

- [Mod System Architecture](mod-system.md) — baseline frontend mod system
- [Slot System & Workspace Event Bus](slot-system.md) — slot declarations, content types, bus API
- [Actions System Design](actions-system-design.md) — declarative action logging, metadata capture
- [Backend Mod System Design](backend-mod-system.md) — backend manifest, unified registry, SDK
