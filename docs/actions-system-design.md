# Declarative Action Logging System

> Date: 2026-07-24 (updated for unified action endpoint, custom action registration)
> Status: Accepted
> Companion to: [Mod System Architecture](mod-system.md), [Slot System & Event Bus](slot-system.md), [Backend Mod System Design](backend-mod-system.md)
> Related ADRs: [ADR-0009 — Actions API Gateway](adr/0009-actions-api-gateway.md)
>
> This document captures the design for the declarative action logging system. It describes how actions are logged through a unified `POST /api/actions/` endpoint, how core CRUD actions are auto-derived, how custom domain actions are registered, and how blocks send actions at runtime.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Core Concepts](#core-concepts)
3. [Action Type Naming](#action-type-naming)
4. [Core Action Auto-Derivation](#core-action-auto-derivation)
5. [Custom Action Registration](#custom-action-registration)
6. [AbstractBaseAction Schema](#abstractbaseaction-schema)
7. [Unified Action Endpoint](#unified-action-endpoint)
8. [HTTP Endpoint Logging](#http-endpoint-logging)
9. [Block Action Logging](#block-action-logging)
10. [Cross-Mod ActivityFeed](#cross-mod-activityfeed)
11. [CFR Part 11 Compliance](#cfr-part-11-compliance)

---

## Problem Statement

Action logging was manual and incomplete. Mod authors had to call `log_action()` by hand in every `perform_create` / `perform_update` method. Only ELN entry CRUD was logged — schema changes, tag operations, protocol CRUD, folder operations, pins, locks, and all in-editor block interactions (table edits, comment changes) went unrecorded. This left the system out of compliance with CFR Part 11 audit requirements and made it easy for mod authors to forget to wire up logging.

---

## Core Concepts

| Term | Definition |
|------|-----------|
| **Action Log** | A framework-logged record of any mutating operation in the system. Created automatically — not manually by users. |
| **AbstractBaseAction** | The abstract Django model that all mod action tables inherit from. Provides `performed_by`, `action_type`, `target_type`, `target_id`, `created_at`, and `metadata` JSON. |
| **Action** | A triple-dotted string identifying what happened: `"{mod}.{target}.{verb_past}"`. Stored in the `action` column. |
| **Core Action** | One of `created`, `edited`, `deleted` — auto-derived for every model registered via `register_action_model()`. |
| **Custom Action** | A domain-specific action (e.g. `"lims.sample.registered"`) explicitly registered via `register_custom_action()`. Maps to a core action; logs both custom + core rows. |
| **Action Catalog** | The full list of registered actions (core + custom) for a mod, returned as `{id, label, action_type}` entries. Frontend discovers via `GET /api/mod-registry/` at boot. |
| **Unified Action Endpoint** | `POST /api/actions/` — the single endpoint for all action logging. HTTP endpoints and blocks both use it. |
| **ActionLoggingMixin** | A DRF viewset mixin that intercepts successful mutating responses and writes action rows automatically. |
| **`@logs_action`** | A decorator for non-viewset mutating operations (e.g., service-layer functions). |
| **Block Action** | An action logged for a block-level mutation. Blocks send actions at runtime via `sendAction()` from `BlockComponentProps`. |
| **ActivityFeed** | A cross-mod block that renders actions from any mod's action table, registered via `registerBlock()` and bindable into any workspace sidebar slot. |

---

## Action Type Naming

All action types use triple-dotted naming: `"{mod}.{target}.{verb_past}"`.

| Pattern | Example | Meaning |
|---------|---------|---------|
| `{mod}.{target}.created` | `eln.entry.created` | An ELN entry was created |
| `{mod}.{target}.updated` | `lims.entity.updated` | An entity was updated |
| `{mod}.{target}.deleted` | `tags.tag.deleted` | A tag was deleted |
| `{mod}.{target}.{custom}` | `eln.entry.status-changed` | An entry's status was changed |
| `{mod}.block.created` | `eln.block.created` | A block instance was created in the editor |
| `{mod}.block.edited` | `eln.block.edited` | A block instance was edited |
| `{mod}.block.deleted` | `eln.block.deleted` | A block instance was deleted |

**Convention:** `verb_past` is past-tense, lowercase, hyphenated if multi-word. `created`/`updated`/`deleted` for standard CRUD; descriptive verbs for domain-specific operations.

---

## Core Action Auto-Derivation

Every model/viewset registered via `register_action_model()` automatically gets three core actions: `{mod}.{target}.created`, `{mod}.{target}.edited`, `{mod}.{target}.deleted`. No manual registration needed. `ActionLoggingMixin` uses these in `perform_create`, `perform_update`, and `perform_destroy`.

---

## Custom Action Registration

Custom domain actions are explicitly registered in `mod.py` via `register_custom_action(mod_id, action_id, label, core, target_model)`. The `core` parameter must be `"created"`, `"edited"`, or `"deleted"`. When a custom action fires, the backend logs a single row with both `action` (the custom identifier, e.g. `"lims.sample.registered"`) and `action_type` (the mapped core verb, e.g. `"edited"`). The ActivityFeed shows the custom label; the audit trail retains the core CRUD record without duplicating rows.

---

## Unified Action Endpoint

`POST /api/actions/` is the single entry point for all action logging. Accepts: `action`, `action_type`, `target_type`, `target_id`, `metadata`, `workspace_id`, `timestamp`, `performed_by` (from auth). The backend validates `action` against the registered catalog, routes to the correct mod action table, and returns `201 Created` with both `action` and `action_type` in the response. This replaces per-mod batch endpoints and dual pipelines.

---

## AbstractBaseAction Schema

Every mod owns its own action table, inheriting from `AbstractBaseAction`:

```python
class AbstractBaseAction(models.Model):
    """Abstract base for all mod action log tables."""

    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=128)              # "eln.entry.created"
    action_type = models.CharField(max_length=16)          # "created" | "edited" | "deleted"
    target_type = models.CharField(max_length=64)          # ContentType app_label.model
    target_id = models.PositiveIntegerField()
    target = GenericForeignKey("target_type", "target_id")
    created_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict)              # What changed, snapshot, context

    class Meta:
        abstract = True
        indexes = [
            models.Index(fields=["performed_by", "-created_at"]),
            models.Index(fields=["target_type", "target_id"]),
            models.Index(fields=["action_type"]),
        ]
```

**Fields:**

| Field | Purpose |
|-------|---------|
| `performed_by` | The User who performed the action. Nullable — SET_NULL on user deletion preserves the audit record. |
| `action` | Triple-dotted action identifier (e.g. `"eln.entry.created"`). Indexed for filtering. |
| `action_type` | Core CRUD verb: `"created"`, `"edited"`, or `"deleted"`. Always populated — both core and custom actions have a core verb. |
| `target_type` / `target_id` | Generic FK to the affected record. Indexed together. |
| `created_at` | When the action occurred. Auto-set. |
| `metadata` | JSON blob for what changed: old values, new values, snapshot data, request context. |

**Registration:** Each mod calls `register_action_model()` during app ready to register its concrete action model with the action logging framework.

---

## HTTP Endpoint Logging

### ActionLoggingMixin

A DRF viewset mixin that intercepts successful mutating responses:

```python
class ActionLoggingMixin:
    """Automatically logs actions for mutating viewset operations."""

    # Override in subclass
    action_type_prefix = None  # e.g. "eln.entry"
    target_field = "pk"        # URL kwarg for target identification

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._log("created", instance=serializer.instance, data=serializer.validated_data)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        self._log("updated", instance=serializer.instance, data=serializer.validated_data)

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        self._log("deleted", instance=instance)
```

**Usage:**

```python
class EntryViewSet(ActionLoggingMixin, ModelViewSet):
    action_type_prefix = "eln.entry"

    # perform_create, perform_update, perform_destroy are now auto-logged
```

### @logs_action Decorator

For non-viewset mutating operations:

```python
@logs_action("lims.schema.updated", target_arg="entity_type")
def update_entity_type_schema(entity_type: EntityType, columns: list[dict]) -> EntityType:
    entity_type.columns = columns
    entity_type.save()
    return entity_type
```

The decorator captures the target object, builds the action row, and writes it after the function succeeds. If the function raises, no action is logged (actions only record successful operations).

---

## Block Action Logging

Blocks send domain actions at runtime via `sendAction()` from `BlockComponentProps` — they do not declare static `messages` in `registerBlock()`. The block determines which action to send based on what the user did:

```ts
function LimsTableBlock({ sendAction, slotContext }: BlockComponentProps) {
  const handleRegister = (entity: Entity) => {
    sendAction("lims.sample.registered", {
      target_type: "lims.entity", target_id: entity.id,
      metadata: { name: entity.name },
    });
  };
}
```

The action catalog (`slotContext.actions`) tells the block what action types are valid for the current workspace. `sendAction()` calls `POST /api/actions/` with the current workspace ID. This replaces the previous batched pipeline (`bus.collect()` + `bus.flush()`).

---

## Cross-Mod ActivityFeed

The `ActivityFeed` component is a cross-mod block registered via `registerBlock()`. It reads from the platform-level action log and renders actions from any mod.

```ts
registerBlock({
  id: "activity.feed",
  label: "Activity Feed",
  component: ActivityFeedBlock,
  listensTo: ["eln.block.created", "eln.block.edited", "eln.block.deleted"],
  onEvent: {
    "eln.block.created": (instance, payload) => {
      // Refresh the feed when a new block action is collected
    },
  },
});
```

It is bindable into any workspace sidebar slot:

```ts
registerIntoSlot("eln.sidebar", "activity.feed", { order: 0 });
registerIntoSlot("lims.sidebar", "activity.feed", { order: 0 });
```

The ActivityFeed queries the backend for actions via `GET /api/actions/?workspace_id=…&target_id=…`. It renders actions chronologically and groups by target. It shows:
- User avatar + name
- Action description (derived from `action_type` + `metadata`)
- Timestamp
- Target link (clickable display ID)

---

## CFR Part 11 Compliance

The action logging system is designed to meet FDA 21 CFR Part 11 audit trail requirements:

| Requirement | Implementation |
|-------------|---------------|
| **Secure, computer-generated, time-stamped audit trails** | `created_at` auto-set by the server; actions logged automatically by the framework |
| **Record of operator who created, modified, or deleted** | `performed_by` FK to User on every action row |
| **Record of what was changed** | `metadata` JSON captures old/new values, snapshot data |
| **Audit trails must be retained** | Action rows are immutable — no update or delete views exist |
| **Changes must not obscure previously recorded information** | Actions are append-only; `metadata` stores both old and new values |

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Action type naming | Triple-dotted: `mod.target.verb_past` | Consistent with event bus naming; parseable; namespaced by mod |
| Each mod owns its own action table | Concrete table inheriting `AbstractBaseAction` | Mod isolation; no cross-mod coupling; each mod manages its own schema |
| Action endpoint | Single unified `POST /api/actions/` | One audit trail path; HTTP endpoints and blocks use the same API |
| Core actions | Auto-derived from every model/viewset | Zero boilerplate; CFR Part 11 compliance by default |
| Custom actions | `register_custom_action()` with core mapping; single row with both `action` and `action_type` | Domain expressiveness without losing audit trail clarity; no duplicate rows |
| Viewset logging | `ActionLoggingMixin` | DRF-native; intercepts standard hooks; zero boilerplate for mod authors |
| Non-viewset logging | `@logs_action` decorator | Covers service-layer operations; same declarative pattern |
| Block actions | Runtime via `sendAction()` from `BlockComponentProps` | Blocks send domain actions based on what the user did; no static `messages` field |
| Block action catalog | Backend declares via `register_custom_action()`; frontend discovers via `GET /api/mod-registry/` | Single source of truth for valid action types |
| ActivityFeed is a block | Registered via `registerBlock()`, bindable into any slot | Reusable; cross-mod; follows the same pattern as every other UI component |
| Action logging failure | Must never break the operation being logged | Audit trail is critical but secondary to the operation succeeding |
| Immutable action rows | No update/delete endpoints | CFR Part 11 requirement — audit trails must not be alterable |
