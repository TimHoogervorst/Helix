# Actions System Design

> Date: 2026-07-13
> Status: Draft — reconciled with slot system and event bus design
> Companion to: [Mod System Architecture](mod-system.md), [Slot System & Event Bus](slot-system.md), [Backend Mod System Design](backend-mod-system.md)
> Reconciliation: See [Cross-Cutting Events](cross-cutting-events.md) for the unified event naming convention, block→action logging path, and implementation order.
>
> This document captures the proposed architecture for a CFR Part 11-compliant action logging system built on the existing mod infrastructure. It identifies the design topics that need to be stress-tested in a grilling session before implementation.

---

## Table of Contents

1. [What Exists Today](#what-exists-today)
2. [Design Goals](#design-goals)
3. [Design Direction](#design-direction)
4. [Grilling Topic A: Endpoint-Declared Actions](#grilling-topic-a-endpoint-declared-actions)
5. [Grilling Topic B: Block-Declared Actions](#grilling-topic-b-block-declared-actions)
6. [Grilling Topic C: Metadata Capture Strategy](#grilling-topic-c-metadata-capture-strategy)
7. [Grilling Topic D: Cross-Mod Consumption](#grilling-topic-d-cross-mod-consumption)
8. [Grilling Topic E: Migration & Rollout Strategy](#grilling-topic-e-migration--rollout-strategy)
9. [Open Questions](#open-questions)

---

## What Exists Today

### Backend — A working but minimal foundation

```
backend/core/actions/
├── __init__.py          # Re-exports public API
├── base.py              # AbstractBaseAction model
├── registry.py          # register_action_model() / get_action_model()
└── logger.py            # log_action() dispatcher
```

| Piece | Location | What it does |
|---|---|---|
| `AbstractBaseAction` | [base.py](../backend/core/actions/base.py) | Abstract model: `performed_by` (FK to User), `action_type` (char), `target_type` (char), `target_id` (int), `metadata` (JSON), `created_at` (datetime) |
| `register_action_model(mod_id, model_class)` | [registry.py](../backend/core/actions/registry.py) | Each mod registers its concrete action model in `AppConfig.ready()`. Keyed by mod ID string. |
| `get_action_model(mod_id)` | [registry.py](../backend/core/actions/registry.py) | Looks up the concrete model for a mod. Returns `None` if unregistered. |
| `log_action(user, action_type, target_type, target_id, metadata)` | [logger.py](../backend/core/actions/logger.py) | Derives mod from `target_type` prefix (e.g. `"eln.entry"` → `"eln"`), dispatches to the correct concrete table. Raises `ValueError` if the mod is unregistered. |

**Current consumer — ELN only:**

- `ElnAction(AbstractBaseAction)` — concrete table `eln_action` at [eln/models.py:55](../backend/core_mods/eln/models.py#L55)
- Registered in `ElnConfig.ready()` at [eln/apps.py:16](../backend/core_mods/eln/apps.py#L16)
- `log_action()` called **manually** in `perform_create` and `perform_update` of `NotebookEntryViewSet` at [eln/views.py](../backend/core_mods/eln/views.py)
- Custom actions logged via `POST /api/eln/entries/{id}/actions/` (the `_create_action` helper)

**What's NOT logged today:**

- Schema/entity type changes (LIMS settings)
- Tag CRUD
- Protocol CRUD
- Folder operations
- CoreSetting changes
- User preference changes
- Pin/unpin actions
- Lock acquire/release
- Tag attach/detach

### Frontend — ELN-specific, not cross-mod

| Piece | Location | Notes |
|---|---|---|
| `ElnAction` type | [eln/types.ts](../frontend/src/core-mods/eln/types.ts) | Type interface with `performed_by` (nested `ActionUser`) |
| `fetchActions()` / `createAction()` | [eln/api.ts](../frontend/src/core-mods/eln/api.ts) | ELN-specific API functions |
| `useActivity()` hook | [eln/hooks/useActivity.ts](../frontend/src/core-mods/eln/hooks/useActivity.ts) | Fetches paginated actions for a single entry |
| `ActivityFeed` component | [eln/components/ActivityFeed.tsx](../frontend/src/core-mods/eln/components/ActivityFeed.tsx) | Renders actions in the ELN workspace sidebar |
| `actionLabel()` helper | [eln/activityHelpers.ts](../frontend/src/core-mods/eln/activityHelpers.ts) | Maps `action_type` strings to human-readable labels |

There is **no** `registerActionType()` or equivalent in the frontend mod system. Actions are entirely bespoke to the ELN mod. The `ModRegistry` knows nothing about actions.

---

## Design Goals

1. **Pit of success.** A mod author writing a new viewset or content block should log actions automatically — without manually calling `log_action()` or remembering to wire it up. The framework does the boring work.

2. **CFR Part 11 compliance.** Every action that creates, modifies, or deletes an electronic record is logged with: who performed it, what they did, what record they acted on, when it happened, and any relevant metadata about what changed.

3. **Mod-owned storage.** Each mod owns its action table (current `register_action_model()` pattern). Per-mod tables keep concerns separated and align with the plan to give each mod an isolated database schema.

4. **Extends the existing pattern.** Builds on `register_action_model()` and the frontend `register*()` API family. Not a rewrite.

5. **Frontend consumption only.** The frontend mod system does not need new registration functions for actions. The ActivityFeed becomes a cross-mod core component that renders whatever actions the backend returns. No `registerActionType()` on the frontend.

6. **Block-aware.** The design must accommodate actions that originate from in-editor content blocks (e.g. "edited Table 1"), not just HTTP endpoints. Blocks should be able to declare action types that the editor logs when the user interacts with them.

---

## Design Direction

### The Core Idea: Declarative Action Logging

Rather than calling `log_action()` manually in every view method, the **mod author declares** what actions their endpoints perform. The framework intercepts successful mutating responses and writes the action row automatically.

```
┌─────────────────────────────────────────────────────┐
│  Mod author declares:                               │
│                                                     │
│  "My viewset's create → action_type='created'       │
│   My viewset's update → action_type='edited'        │
│   My viewset's destroy → action_type='deleted'"     │
│                                                     │
│  Framework intercepts POST/PUT/PATCH/DELETE          │
│  → on 2xx response → auto-calls log_action()        │
│  → mod author never touches log_action() directly   │
└─────────────────────────────────────────────────────┘
```

This is analogous to Django's permission classes or DRF's throttling — a cross-cutting concern that lives at the view layer and fires automatically.

### Two Trigger Surfaces

Actions originate from two places. The design handles both, but through different mechanisms:

| Surface | Trigger | Mechanism |
|---|---|---|
| **HTTP endpoints** | Successful mutating request (2xx on POST/PUT/PATCH/DELETE) | `ActionLoggingMixin` on the viewset — framework intercepts and calls `log_action()` |
| **In-editor blocks** | User interaction with a content block inside the TipTap editor | Workspace event bus — editor framework emits lifecycle events; workspace shell's action-logging listener translates to API calls |

Both surfaces write to the same action tables through the same `log_action()` dispatcher. The difference is where the declaration lives and who triggers the call.

**Block actions route through the event bus, not a direct API call.** The editor emits `"{mod}.{block}.{verb}"` on the workspace bus. The workspace shell's action-logging listener receives the event, derives the action type mechanically from the event name, and calls the API. The block author never emits events and never calls the action API directly. See [Slot System & Event Bus](slot-system.md) and [Cross-Cutting Events](cross-cutting-events.md) for the full path.

---

## Grilling Topic A: Endpoint-Declared Actions

**The core mechanism.** How does a mod author declare that their endpoints should log actions, and how does the framework intercept and log?

### Strawman Design

A mixin + config dict on the viewset:

```python
from core.actions.mixins import ActionLoggingMixin

class NotebookEntryViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    action_mod = "eln"

    action_log_config = {
        "create":  {"action_type": "created", "target_type": "eln.entry"},
        "update":  {"action_type": "edited",  "target_type": "eln.entry"},
        "destroy": {"action_type": "deleted", "target_type": "eln.entry"},
        # Custom @action methods:
        "attach_tags":  {"action_type": "tags_attached",  "target_type": "eln.entry"},
        "detach_tag":   {"action_type": "tag_detached",    "target_type": "eln.entry"},
    }
```

The mixin hooks into the request lifecycle. On any successful mutating response, it:
1. Looks up the config entry for the current action name
2. Extracts `user` from `request.user`
3. Resolves `target_id` from the instance (post-response, since `create` only has a PK after save)
4. Calls `log_action()` with the declared values

### Key Design Decisions to Grill

1. **Where does the config live?** On the viewset class (as above)? In a separate config module? Registered imperatively like `register_action_model()`?

2. **How is `target_id` resolved?**
   - For `create`: the instance PK is only available after `perform_create` runs. The hook must be post-response.
   - For `update`/`destroy`: the instance already exists, but the hook needs access to it.
   - For custom `@action` methods: the target might be derived from URL kwargs, not `self.get_object()`.

3. **How does the framework know which instance?** Default: `self.get_object()` (works for detail routes). Override: a callable `get_target` on the config entry for non-standard cases.

4. **What about actions that don't target a single record?** E.g., "delete all entries" — `target_id` might be absent or a count. Does the system need to support non-targeted actions? Or do we log one action per affected record?

5. **Mixins vs. decorators?** A mixin on the viewset class vs. a `@logs_action` decorator on individual methods. Which is the pit of success?

6. **Error handling.** If `log_action()` itself fails (DB down, registry misconfigured), does the request still succeed? (Almost certainly yes — logging failure must never break the actual operation.)

7. **Opt-out?** Should mod authors be able to mark certain endpoints as *not* logged? Or is "everything mutating is logged" the default, with an explicit opt-out for things like lock refresh?

8. **Read operations?** CFR Part 11 does not require logging reads. But should the system support it for mods that want it?

### Comparison with the Block Registration Pattern

The frontend `registerBlock()` pattern is a good analog:

```typescript
// Frontend: mods declare blocks imperatively
registerBlock({ id: "eln.table", label: "Table", ... });
```

Should the backend follow the same imperative style?

```python
# Backend: mods declare action configs imperatively
register_action_config("eln", "create", action_type="created", target_type="eln.entry")
```

Or is a declarative class-level config (the strawman above) cleaner?

---

## Grilling Topic B: Block-Declared Actions

**The extension mechanism.** Content blocks inside the ELN editor (Tables, Comments, LIMS tables, future blocks) produce actions when the user interacts with them. The block declares its identity — the framework does the rest.

### The Problem

Today, editing a table inside an ELN entry is invisible to the action log. The only action logged is `"edited"` on the entry itself — which collapses all in-editor changes (text edits, table edits, comment changes) into a single undifferentiated event.

The goal: when a user edits a table block, the activity feed shows:

> **Tim** edited table **Samples** · 2 minutes ago

### Reconciled Design (with Slot System)

Block actions route through the **workspace event bus** (see [slot-system.md](slot-system.md)). The editor framework emits lifecycle events automatically. The workspace shell's action-logging listener translates events into API calls. The block author declares identity and optional message overrides — never emits events, never calls the action API.

The `BlockConfig` (defined in the slot system, registered via `registerIntoSlot()` as `BlockSlotContent`) carries:

```typescript
// From slot-system.md — BlockSlotContent
interface BlockSlotContent {
  type: "block";
  id: string;                          // "eln.table" — drives action_type derivation
  label: string;                       // "Table"
  icon: string;
  listensTo: string[];
  onEvent: Record<string, (instance: BlockInstance, payload: unknown) => unknown | void>;

  /** Human-readable message overrides. Defaults to "{label} was created/edited/deleted" */
  messages?: {
    created?: string;
    edited?: string;
    deleted?: string;
  };

  /** Extract a display name from block attributes for the activity feed */
  getDisplayName?: (attrs: Record<string, unknown>) => string;

  node?: Node;
  component?: ComponentType<BlockProps>;
}
```

### Action Type Derivation

Mechanical, zero-ceremony. Derived from block ID + lifecycle event:

| Lifecycle event | Verb | Resulting action_type |
|-----------------|------|----------------------|
| Block inserted | `created` | `"{mod}.{block}.created"` — e.g. `"eln.table.created"` |
| Block changed | `edited` | `"{mod}.{block}.edited"` — e.g. `"eln.table.edited"` |
| Block removed | `deleted` | `"{mod}.{block}.deleted"` — e.g. `"eln.table.deleted"` |

### Message Derivation

```
Default:            "{label} was {verb_past}"              → "Table was edited"
With getDisplayName: "{label} '{name}' was {verb_past}"    → "Table 'Samples' was edited"
With messages:       uses custom string                     → "spreadsheet was touched"
```

### The Backend Side

The block action flows through the workspace shell's action-logging listener, which calls `POST /api/{mod}/entries/{entryId}/actions/`. The backend doesn't need to know about blocks specifically — it just stores whatever `action_type` and `metadata` the frontend sends.

### Cross-Mod Block Action Routing

A future LIMS mod might contribute a block. Its actions should write to the LIMS action table, not ELN's. The mod is derived mechanically from the block ID's first segment: `"lims.data-table"` → mod = `"lims"` → targets LIMS `Action` table. No special routing — the derivation rule handles it.

---

## Grilling Topic C: Metadata Capture Strategy

**What goes into the `metadata` JSON field, who provides it, and how is it structured?**

### Current State

Today, metadata is sparse and manually populated:

```python
# On create: nothing
log_action(user=author, action_type="created", target_type="eln.entry", target_id=42)

# On edit: version metadata
log_action(user=user, action_type="edited", target_type="eln.entry", target_id=42,
           metadata={"version_id": 7, "version_number": 3, "save_mode": "manual"})
```

### What the Framework Could Capture Automatically

The mixin/decorator has access to `serializer.validated_data` and the request. It could auto-populate:

| Field | Source | Example |
|---|---|---|
| `changed_fields` | `validated_data` keys (for update/partial_update) | `["title", "content", "status"]` |
| `request_id` | Request header or generated UUID | `"a1b2c3d4"` |
| `client_ip` | `request.META["REMOTE_ADDR"]` | `"192.168.1.1"` |
| `user_agent` | Request header | `"Helix/1.0"` |

### What the Mod Author Might Want to Add

Per-action metadata that the framework can't derive:

```python
action_log_config = {
    "update": {
        "action_type": "edited",
        "target_type": "eln.entry",
        # Custom metadata provider — called after save
        "get_metadata": lambda instance, validated_data: {
            "version_number": ContentVersion.next_version_number(instance),
            "save_mode": validated_data.get("save_mode", "manual"),
        },
    },
}
```

### What Block Actions Might Include

```json
{
  "blockId": "eln.table",
  "blockLabel": "Table",
  "targetName": "Samples",
  "cellCount": 12,
  "changedCells": 3
}
```

### Key Design Decisions to Grill

1. **Schema or freeform?** `metadata` is currently `models.JSONField(default=dict)`. Should there be a per-action-type metadata schema that the framework validates? Or is freeform JSON fine?

2. **Automatic `changed_fields` — opt-in or opt-out?** Capturing changed field names on every update is useful for audit trails. But for large JSON content fields it could be noisy (listing "content" changed when the entire TipTap doc was replaced).

3. **Diff vs. flag.** Should metadata capture *what* changed (a diff) or just *that* it changed (a field name list)? Full diffs are more useful for audit but larger to store. CFR Part 11 requires the ability to reconstruct what happened — does a field-name list suffice?

4. **Privacy.** `client_ip` and `user_agent` are useful for security audit but have privacy implications. Are they always captured? Configurable per-mod?

---

## Grilling Topic D: Cross-Mod Consumption

**How does the frontend consume actions from any mod, not just ELN?**

### The Vision

The `ActivityFeed` component moves from `core-mods/eln/` to `shared/`. It becomes a cross-mod component that:

1. Accepts a list of actions in a generic shape (`ActionItem` interface)
2. Renders them with actor name, action label, relative timestamp
3. Knows nothing about which mod the action came from
4. Subscribes to the workspace bus via `bus.on()` for optimistic real-time updates

The ELN workspace registers it as a `ComponentSlotContent` into the sidebar slot. The LIMS workspace does the same. A future "Global Audit Log" page at `/audit` could show actions from all mods.

### Where ActivityFeed Lives

`shared/components/Activity.tsx` — alongside `BaseCard`, `StatusBadge`, `Breadcrumbs`, etc. It is platform SDK, not ELN-specific. The mod-system.md already references this location. It registers into workspace sidebar slots as a component, not a block.

### Generic Action Shape

```typescript
// In shared/types/actions.ts or core/actions/types.ts
interface ActionItem {
  id: number;
  performedBy: ActionUser;
  actionType: string;
  targetType: string;
  targetId: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface ActionUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  color: string;
}
```

### Action Label Resolution

The `actionLabel()` helper currently lives in `eln/activityHelpers.ts` and maps ELN-specific strings like `"created"` → `"created this entry"`. For cross-mod consumption, this moves to `shared/` with a simple humanization approach:

```typescript
// In shared/ — simple humanization, no registration needed
function actionLabel(actionType: string): string {
  // "eln.entry.created" → "created"
  // "eln.table.edited" → "edited"
  return humanize(actionType.split(".").pop()!);
}
```

The human-readable message displayed in the ActivityFeed is either:
- The block's `messages` override (from `BlockSlotContent.messages`)
- The default template `"{label} was {verb_past}"` enhanced with `getDisplayName`

No `registerActionLabel()` needed. The triple-dotted action type is self-describing.

### Key Design Decisions (Resolved)

1. **Where does `ActivityFeed` live?** → `shared/components/Activity.tsx`. It registers into workspace sidebar slots as `ComponentSlotContent`.

2. **Does the frontend need `registerActionLabel()`?** → No. Humanization function + block message overrides suffice.

3. **Cross-mod action fetching.** A unified endpoint `GET /api/actions/?user=42&since=...` across all mod tables is a future concern (global audit log, Phase 8+).

4. **Per-workspace vs. global activity.** The same `ActivityFeed` component with different data sources. Per-workspace: actions scoped to an entry/entity. Global: actions from all mods.

---

## Grilling Topic E: Migration & Rollout Strategy

**How do we get from the current state to the target state without breaking existing functionality?**

### Current ELN Actions — Keep or Migrate?

The ELN mod already has working action logging. Two options:

**Option A: Retrofit ELN first.** Convert `NotebookEntryViewSet` to use the new declarative mechanism. Prove the pattern works on the one existing consumer, then roll out to other mods.

**Option B: Build the framework, leave ELN as-is.** The new mixin/decorator is additive. ELN continues to call `log_action()` manually until we're confident in the new pattern, then we migrate it.

### Rollout Order

Actions system rollout (see [cross-cutting-events.md](cross-cutting-events.md) for the full cross-doc implementation order):

1. **Build the framework** — the `ActionLoggingMixin`, metadata capture, error handling (Phase 3 overall)
2. **Retrofit ELN** — convert `NotebookEntryViewSet` to use the new mechanism (dogfood it)
3. **Add actions to LIMS** — entity type CRUD, entity CRUD (the second mod proves the pattern generalizes)
4. **Add actions to remaining mods** — tags, protocols, settings, folders, pins
5. **Block-declared actions** — extends `BlockSlotContent` (Phase 5 overall, depends on slot system + event bus landing first)
6. **Move ActivityFeed to shared/** — make it cross-mod, register as component slot (Phase 6 overall)

### Key Design Decisions to Grill

1. **Big-bang framework or incremental?** Build the full mixin/decorator system first, or start with a minimal version and evolve it?

2. **Backward compatibility.** The existing `log_action()` function must continue to work. The new mechanism wraps it, not replaces it.

---

## Open Questions

These are broader questions that cut across multiple grilling topics:

1. **Action type naming convention.** Should there be a dotted namespace convention? E.g. `"{mod}.{target}.{verb}"` → `"eln.entry.created"`, `"lims.entity.deleted"`, `"eln.table.edited"`. This would make action types self-describing and help with cross-mod filtering.

2. **Action retention / cleanup.** Do actions ever get deleted? CFR Part 11 requires records to be retained for the lifetime of the electronic record. If an entry is deleted, do its actions survive? (Probably yes — they're the audit trail proving the deletion happened.)

3. **Performance.** A single entry edit might produce multiple block-level actions plus an entry-level action. Should these be batched into one API call? Should the frontend debounce block action logging?

4. **Future external mod API.** When external mods are supported (see [mod-system.md § Future: External Mod API](mod-system.md#future-external-mod-api)), they must be able to declare actions through the same mechanism. The design should not assume all mods live in `core_mods/`.

5. **Notifications.** Actions and notifications are closely related — "User X commented on your entry" is both an action log entry and a notification trigger. Should the action system be the single source of truth that a notification system reads from? Or are they separate pipelines?

---

## References

- [Mod System Architecture](mod-system.md) — the existing mod registration pattern this design extends
- [backend/core/actions/](../backend/core/actions/) — current action logging infrastructure
- [backend/core_mods/eln/models.py](../backend/core_mods/eln/models.py#L55) — `ElnAction`, the only concrete action model
- [backend/core_mods/eln/views.py](../backend/core_mods/eln/views.py) — where `log_action()` is currently called manually
- [frontend/src/core/mod-system/types.ts](../frontend/src/core/mod-system/types.ts#L67) — `BlockConfig`, which will gain an optional `action` field
