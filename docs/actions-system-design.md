# Declarative Action Logging System

> Date: 2026-07-16
> Status: Accepted
> Companion to: [Mod System Architecture](mod-system.md), [Slot System & Event Bus](slot-system.md)
>
> This document captures the design for the declarative action logging system. It replaces manual `log_action()` calls with a declarative approach using `ActionLoggingMixin` + `@logs_action`, and routes block-level actions through the workspace event bus for on-save batching.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Core Concepts](#core-concepts)
3. [Action Type Naming](#action-type-naming)
4. [AbstractBaseAction Schema](#abstractbaseaction-schema)
5. [HTTP Endpoint Logging](#http-endpoint-logging)
6. [Block Action Logging](#block-action-logging)
7. [Cross-Mod ActivityFeed](#cross-mod-activityfeed)
8. [Batched Save Pipeline](#batched-save-pipeline)
9. [CFR Part 11 Compliance](#cfr-part-11-compliance)

---

## Problem Statement

Action logging was manual and incomplete. Mod authors had to call `log_action()` by hand in every `perform_create` / `perform_update` method. Only ELN entry CRUD was logged — schema changes, tag operations, protocol CRUD, folder operations, pins, locks, and all in-editor block interactions (table edits, comment changes) went unrecorded. This left the system out of compliance with CFR Part 11 audit requirements and made it easy for mod authors to forget to wire up logging.

---

## Core Concepts

| Term | Definition |
|------|-----------|
| **Action Log** | A framework-logged record of any mutating operation in the system. Created automatically — not manually by users. |
| **AbstractBaseAction** | The abstract Django model that all mod action tables inherit from. Provides `performed_by`, `action_type`, `target_type`, `target_id`, `created_at`, and `metadata` JSON. |
| **Action Type** | A triple-dotted string identifying what happened: `"{mod}.{target}.{verb_past}"` (e.g. `"eln.entry.created"`, `"lims.schema.updated"`). |
| **ActionLoggingMixin** | A DRF viewset mixin that intercepts successful mutating responses and writes action rows automatically. |
| **`@logs_action`** | A decorator for non-viewset mutating operations (e.g., service-layer functions). |
| **Block Action** | An action logged for a block-level mutation (create, edit, delete) within an editor workspace. Routed through the workspace event bus and batched on save. |
| **ActivityFeed** | A cross-mod block that renders actions from any mod's action table, registered via `registerBlock()` and bindable into any workspace sidebar slot. |

---

## Action Type Naming

All action types use triple-dotted naming: `"{mod}.{target}.{verb_past}"`.

| Pattern | Example | Meaning |
|---------|---------|---------|
| `{mod}.{target}.created` | `eln.entry.created` | An ELN entry was created |
| `{mod}.{target}.updated` | `lims.entity.updated` | A LIMS entity was updated |
| `{mod}.{target}.deleted` | `tags.tag.deleted` | A tag was deleted |
| `{mod}.{target}.{custom}` | `eln.entry.status-changed` | An entry's status was changed |
| `{mod}.block.created` | `eln.block.created` | A block instance was created in the editor |
| `{mod}.block.edited` | `eln.block.edited` | A block instance was edited |
| `{mod}.block.deleted` | `eln.block.deleted` | A block instance was deleted |

**Convention:** `verb_past` is past-tense, lowercase, hyphenated if multi-word. `created`/`updated`/`deleted` for standard CRUD; descriptive verbs for domain-specific operations.

---

## AbstractBaseAction Schema

Every mod owns its own action table, inheriting from `AbstractBaseAction`:

```python
class AbstractBaseAction(models.Model):
    """Abstract base for all mod action log tables."""

    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action_type = models.CharField(max_length=128)       # "eln.entry.created"
    target_type = models.CharField(max_length=64)         # ContentType app_label.model
    target_id = models.PositiveIntegerField()
    target = GenericForeignKey("target_type", "target_id")
    created_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict)             # What changed, snapshot, context

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
| `action_type` | Triple-dotted action identifier. Indexed for filtering. |
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

Blocks declare action log messages in their registration:

```ts
registerBlock({
  id: "eln.table",
  messages: {
    created: "added a LimsTable",
    edited: "edited a LimsTable",
    deleted: "removed a LimsTable",
  },
  getDisplayName: (attrs) => attrs.tableName || "Untitled Table",
});
```

Block lifecycle events (`eln.block.created`, `eln.block.edited`, `eln.block.deleted`) are emitted by the renderer into the workspace event bus. The workspace shell collects these via `bus.collect()` — they are **batched** and sent as a single API call on save.

This means:
- Block authors declare messages once in `registerBlock()`
- They never call `log_action()` or `bus.emit()` manually
- Actions are accumulated during an editing session
- On save, all accumulated block actions are flushed as a batch to the backend

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

The ActivityFeed queries the backend for all action types, renders them chronologically, and groups by target. It shows:
- User avatar + name
- Action description (derived from `action_type` + `metadata`)
- Timestamp
- Target link (clickable display ID)

---

## Batched Save Pipeline

```
User edits entry with blocks
  → Renderer detects block create/edit/delete
    → bus.collect("eln.block.created", { blockId, attrs, ... })
    → bus.collect("eln.block.edited", { blockId, attrs, ... })

User clicks Save (or auto-save fires)
  → Workspace shell calls bus.emit("workspace.save.requested")
    → Entry content saved to backend
    → bus.flush() → all collected events sent as batch POST /api/actions/batch/
      → Backend creates Action rows for each event
    → ActivityFeed block receives events, refreshes
```

**Why batch:** A single editing session may produce dozens of block-level mutations. Sending each as an individual API call would be wasteful. Batching reduces network overhead and ensures atomicity — either all actions are logged or none are.

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
| Viewset logging | `ActionLoggingMixin` | DRF-native; intercepts standard hooks; zero boilerplate for mod authors |
| Non-viewset logging | `@logs_action` decorator | Covers service-layer operations; same declarative pattern |
| Block actions batched | `bus.collect()` + flush on save | Reduces API calls; ensures atomicity |
| ActivityFeed is a block | Registered via `registerBlock()`, bindable into any slot | Reusable; cross-mod; follows the same pattern as every other UI component |
| Action logging failure | Must never break the operation being logged | Audit trail is critical but secondary to the operation succeeding |
| Immutable action rows | No update/delete endpoints | CFR Part 11 requirement — audit trails must not be alterable |
