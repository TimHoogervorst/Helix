# Slot System & Workspace Event Bus

> Date: 2026-07-13
> Status: Draft — extracted from GitHub issue #205, reconciled with actions system design
> Companion to: [Mod System Architecture](mod-system.md), [Actions System Design](actions-system-design.md), [Cross-Cutting Events](cross-cutting-events.md)
>
> Implementation order: **3** (after Backend Mod Manifest, after Unified Backend Registry, before Block-Declared Actions)

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Slot System](#slot-system)
3. [Content Types](#content-types)
4. [Workspace Event Bus](#workspace-event-bus)
5. [Built-in Lifecycle Events](#built-in-lifecycle-events)
6. [How Slots and Events Fit Together](#how-slots-and-events-fit-together)
7. [Rollout Sketch](#rollout-sketch)
8. [Key Design Decisions](#key-design-decisions)

---

## Core Concepts

| Term | Definition |
|------|-----------|
| **Slot** | A named placeholder declared by a workspace. Has an `id`, a `type`, and optional `maxItems`. |
| **Slot type** | Validates what can go in: `"button-group"`, `"block-container"`, `"component"`, `"list"`, `"tabs"`. |
| **Slot content** | What a mod registers into a slot. Shape is determined by slot type: `ButtonSlotContent`, `BlockSlotContent`, or `ComponentSlotContent`. All receive `{ bus, context }`. |
| **SlotContext** | Always available: `{ workspaceId, entryId, displayId, user, viewMode }`. |
| **SlotRenderer** | The component the workspace renders at the slot position. Reads the registry, sorts by `order`, renders matched content. Knows nothing about which mods contributed. |
| **WorkspaceBus** | Scoped event bus per workspace instance. Three methods: `emit()`, `collect()`, `request()`. |
| **Validation** | At boot: slot must be declared before content targets it, content type must match slot type, maxItems enforced. |

---

## Slot System

**Workspaces declare named slots. Mods register content into them. The workspace owns layout; the mod owns behavior.**

```
WORKSPACE (host)                     MOD (contributor)
──────────────                       ─────────────────
declareSlot({                        registerIntoSlot("eln.header.actions", {
  id: "eln.header.actions",            type: "button",
  type: "button-group",                id: "charts.export",
  maxItems: 4                          label: "Export",
})                                     onClick: ({ bus }) => { ... }
                                    })
```

### Slot ID Convention

`"{workspaceId}.{region}.{name}"` — e.g., `"eln.header.actions"`, `"eln.editor"`, `"eln.sidebar"`.

### Registration API

```typescript
// Workspace declares a slot during its own registration
declareSlot({
  id: string;                          // "eln.header.actions"
  type: "button-group" | "block-container" | "component" | "list" | "tabs";
  maxItems?: number;
}): void;

// Mod registers content into a declared slot
registerIntoSlot(slotId: string, content: ButtonSlotContent | BlockSlotContent | ComponentSlotContent): void;
```

Existing flat registrations (`registerHub()`, `registerRoute()`, `registerSettingsSection()`, etc.) stay for app-level concerns. Slots handle embedded UI extension only.

---

## Content Types

Three content shapes at the same level. The slot type determines which shapes it accepts.

### `ButtonSlotContent`

Rendered inside a `"button-group"` or `"list"` slot. Carries an `onClick` handler.

```typescript
interface ButtonSlotContent {
  type: "button";
  id: string;
  label: string;
  icon?: ComponentType;
  order?: number;
  onClick: (args: { bus: WorkspaceBus; context: SlotContext }) => void;
}
```

### `BlockSlotContent`

Rendered inside a `"block-container"` slot (the editor). The editor framework manages block lifecycle and emits events automatically. The block author never calls `bus.emit()` — only declares identity, what it listens to, and optional message overrides.

```typescript
interface BlockSlotContent {
  type: "block";
  id: string;                          // "eln.table" — drives action_type derivation
  label: string;                       // "Table"
  icon: string;
  tags?: string[];
  
  /** Events this block reacts to. The editor routes only matching events. */
  listensTo: string[];
  
  /** Handlers for inbound events. The block author only writes reactions. */
  onEvent: Record<string, (instance: BlockInstance, payload: unknown) => unknown | void>;
  
  /** Human-readable message overrides. Defaults to "{label} was created/edited/deleted" */
  messages?: {
    created?: string;
    edited?: string;
    deleted?: string;
  };
  
  /** Extract a display name from block attributes. Used for the activity feed — e.g., "Table 'Samples' was edited". */
  getDisplayName?: (attrs: Record<string, unknown>) => string;
  
  node?: Node;
  component?: ComponentType<BlockProps>;
}
```

### `ComponentSlotContent`

Generic component slot for anything that doesn't fit button or block. Receives the bus and context as props.

```typescript
interface ComponentSlotContent {
  type: "component";
  id: string;
  component: ComponentType<{ bus: WorkspaceBus; context: SlotContext }>;
  order?: number;
}
```

**Example — ActivityFeed registered into a sidebar slot:**

```typescript
registerIntoSlot("eln.sidebar", {
  type: "component",
  id: "eln.activity-feed",
  component: ActivityFeed,
  order: 10,
});
```

---

## Workspace Event Bus

**Every piece of communication is a message on the workspace bus. Three methods. One pattern.**

```typescript
interface WorkspaceBus {
  /** Subscribe to an event. Returns an unsubscribe function. */
  on(event: string, handler: (payload: unknown) => void): () => void;

  /** Fire and forget. Delivers to all listeners that declared `listensTo` (blocks) or subscribed via `bus.on()` (components). */
  emit(event: string, payload?: unknown): void;

  /** Fire and collect. Wait for all listeners to respond. Returns array of results. */
  collect<T = unknown>(event: string, payload?: unknown): Promise<T[]>;

  /** Fire and return first result. Short-circuits after one listener responds. */
  request<T = unknown>(event: string, payload?: unknown): Promise<T | null>;
}
```

| Method | Use case |
|---|---|
| `on()` | Subscribe imperatively (components, workspace shell) |
| `emit()` | "Block was updated" — no response needed |
| `collect()` | "Export your data" — gather from all blocks, merge |
| `request()` | "Who owns cell X?" — first block that answers wins |

### How listeners work

**Blocks** declare what they listen to at registration via `listensTo` + `onEvent`. The editor routes events only to blocks that declared interest — no broadcasting to uninterested listeners.

**Components** subscribe imperatively via `bus.on(event, handler)` inside `useEffect`. Mounting = subscribing, unmounting = unsubscribing. React's lifecycle handles cleanup.

**The workspace shell** subscribes to lifecycle events for cross-cutting concerns (action logging, lock management, auto-save). These listeners are set up when the workspace mounts.

---

## Built-in Lifecycle Events

The editor framework emits these automatically. Block authors never call `bus.emit()`.

### Workspace Events

| Event | Payload | When |
|-------|---------|------|
| `{workspaceId}.workspace.mounted` | `{ workspaceId }` | Workspace rendered, bus ready |
| `{workspaceId}.workspace.unmounted` | `{ workspaceId }` | Workspace about to unmount |

### Entry Events

| Event | Payload | When |
|-------|---------|------|
| `{mod}.entry.loaded` | `{ entryId, displayId, content }` | Entry data fetched |
| `{mod}.entry.saving` | `{ entryId }` | Before save — listeners can queue work |
| `{mod}.entry.saved` | `{ entryId, versionNumber }` | After successful save |

### Block Events (framework-emitted, not block-emitted)

| Event | Payload | When |
|-------|---------|------|
| `{mod}.{block}.created` | `{ blockId, blockType, attrs }` | Block inserted into editor |
| `{mod}.{block}.edited` | `{ blockId, blockType, changedAttrs }` | Block content changed |
| `{mod}.{block}.deleted` | `{ blockId, blockType }` | Block removed from editor |

### Ephemeral Events (not logged)

| Event | Payload | When |
|-------|---------|------|
| `{mod}.selection.changed` | `{ blockId, selectedCells, selectedText }` | User selection changed |

---

## How Slots and Events Fit Together

```
┌──────────────────────────────────────────────────────────────┐
│  ELN WORKSPACE                                                │
│                                                              │
│  ═══════════ WORKSPACE EVENT BUS ═══════════                  │
│                                                              │
│  SLOT: header.actions          SLOT: editor (block-container) │
│  ┌────────────────────┐        ┌─────────────────────────┐   │
│  │ [Export]  [Lock]   │        │ [Data Table]            │   │
│  │   onClick:          │ emit   │   listensTo:            │   │
│  │   bus.collect(      │───────▶│     ["data.export"]     │   │
│  │     "data.export")  │        │   onEvent: {            │   │
│  │                     │◀───────│     "data.export": fn   │   │
│  │                     │ result │   }                     │   │
│  └────────────────────┘        └─────────────────────────┘   │
│                                      │                        │
│  SLOT: sidebar                      │ block.edited            │
│  ┌────────────────────┐             │ (framework-emitted)     │
│  │ [Activity Feed]    │◀────────────┘                        │
│  │   bus.on(           │                                     │
│  │     "eln.entry.saved"                                     │
│  │     "eln.table.edited"                                    │
│  │   )                                                       │
│  └────────────────────┘                                      │
│                                                              │
│  Workspace Shell (action-logging listener)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Listens to: entry.saved, block.created/edited/deleted │   │
│  │ On event → derives action_type → POST /api/.../actions│   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**The flow for a block edit:**

1. User edits a table block → ProseMirror transaction commits
2. Editor detects the block node changed → emits `"eln.table.edited"` on the bus (framework, not block author)
3. Workspace shell's action-logging listener receives the event → derives `action_type = "eln.table.edited"` → `POST /api/eln/entries/{id}/actions/`
4. ActivityFeed component's `bus.on("eln.table.edited", ...)` handler fires → optimistically prepends to the feed
5. Export button's `onClick` can still call `bus.collect("data.export")` → blocks respond

---

## Rollout Sketch

1. Add `declareSlot()` and `registerIntoSlot()` to `ModRegistry`
2. Add `SlotRenderer` component — renders content for a given slot ID
3. Add `WorkspaceBus` — scoped to workspace, routes events by `listensTo`
4. Convert ELN workspace header to a slot, dogfood with one button
5. Convert editor to `"block-container"` slot, wire up lifecycle events (framework-emitted)
6. Convert sidebar panels to slots
7. Wire up the workspace shell's action-logging listener

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Slots vs. flat registration | Slots for embedded UI only; flat registrations for app-level concerns | Not everything is a slot. Routes, hubs, settings keep `register*()`. |
| Content types | Three: button, block, component | Same registration mechanism, different shapes. Slot type validates. |
| Event emission | Framework-emitted for lifecycle, never block-emitted | Pit of success — block author can't forget. |
| Block lifecycle events | Always fire (`created`, `edited`, `deleted`) | No opt-out from emission. Message override available, not event suppression. |
| Action type derivation | `"{mod}.{block}.{verb}"` from block ID + lifecycle event | Mechanical, zero-ceremony. Block author only provides `messages` overrides. |
| Listener declaration | Declarative for blocks (`listensTo`); imperative for components (`bus.on()`) | Blocks are the common case and need editor framework routing. Components use standard React patterns. |
| Event naming | Triple-dotted: `"{mod}.{target}.{verb_past}"` | Same string used on bus, in action log DB, and in ActivityFeed subscriptions. |
| Non-block listeners | No `registerEventListener()` — components use `bus.on()` in `useEffect` | Mount = subscribe, unmount = unsubscribe. No new API surface. |
| Action logging ownership | Workspace shell, not editor | Editor emits facts. Workspace translates facts into action log entries. |

---

## References

- [Mod System Architecture](mod-system.md) — existing registration API this extends
- [Actions System Design](actions-system-design.md) — action logging built on this event system
- [Cross-Cutting Events](cross-cutting-events.md) — reconciliation doc: event naming, block→action path, service boundaries
