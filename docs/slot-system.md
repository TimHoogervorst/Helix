# Slot System & Workspace Event Bus

> Date: 2026-07-14
> Status: Spec — redesigned with renderer-based architecture (grilling session 2026-07-14)
> Companion to: [Mod System Architecture](mod-system.md), [Actions System Design](actions-system-design.md), [Cross-Cutting Events](cross-cutting-events.md)
>
> Implementation order: **4** (after Backend Mod Manifest, after Unified Backend Registry, after Declarative Action Mixins, before Block-Declared Actions)

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Architecture Overview](#architecture-overview)
3. [Registration API](#registration-api)
4. [Slot Declarations & Renderers](#slot-declarations--renderers)
5. [Slot Bindings](#slot-bindings)
6. [The Renderer Contract](#the-renderer-contract)
7. [Workspace Event Bus](#workspace-event-bus)
8. [Block Lifecycle & Action Logging](#block-lifecycle--action-logging)
9. [SlotRenderer Component](#slotrenderer-component)
10. [Registry Shapes](#registry-shapes)
11. [Validation](#validation)
12. [Rollout Sketch](#rollout-sketch)
13. [Key Design Decisions](#key-design-decisions)

---

## Core Concepts

| Term | Definition |
|------|-----------|
| **Block** | A reusable content type registered via `registerBlock()`. Has an `id`, `label`, `icon`, a `component` (React component), optional `listensTo`/`onEvent` for event bus reactions, `serialize`/`deserialize` for state persistence, and optional `messages` overrides for action logging. A block is a **type** — registered once, usable in many slots. |
| **Button** | A simple fire-only trigger registered via `registerButton()`. Has `id`, `label`, `icon`, and `onClick({ bus, context })`. No component — renders via the slot's renderer. Fire-only: buttons emit events but never listen. |
| **Slot** | A named placeholder declared by a workspace via `declareSlot()`. Has an `id`, `accepts` (block or button), a `renderer` component, a `layout` direction (horizontal/vertical), and optional `defaults` for bindings. The slot owns how things are rendered; the block/button owns what is rendered. |
| **Slot Renderer** | The component the slot delegates to for rendering. Owns layout, lifecycle, and event routing for everything registered into that slot. Four built-in renderers: `TipTapRenderer`, `ButtonGroupRenderer`, `PanelRenderer`, `TabRenderer`. |
| **Slot Binding** | Created by `registerIntoSlot(slotId, targetId, overrides?)`. Connects a block or button to a slot. Per-binding `overrides` merge with slot `defaults`; binding overrides win. |
| **SlotRenderer** | Thin resolution component. Looks up the slot → gets renderer + defaults → looks up bindings → resolves each target from the registry → merges defaults with overrides → delegates to renderer. |
| **BlockComponentProps** | `{ context: SlotContext; instance: BlockInstance }`. No `bus` — blocks respond to events via `onEvent`, they don't initiate. |
| **BlockInstance** | A handle to a specific occurrence of a block in a slot: `{ id, blockId, slotId, attrs, updateAttrs }`. `attrs` is the deserialized block state; `updateAttrs(newState)` replaces entirely, triggers serialize + persist. |
| **SlotContext** | Flat bag of available metadata: `{ workspaceId, user, viewMode, entryId?, entityId?, displayId? }`. Blocks check for what they need. |
| **WorkspaceBus** | Scoped event bus per workspace instance. Cross-slot: buttons in one slot can fire events blocks in another slot listen to. Three methods: `emit()`, `collect()`, `request()`. |
| **Validation** | At boot: slot must be declared before bindings target it; binding target must match slot's `accepts`. Failures log a console warning and skip the bad binding — no crash. |

---

## Architecture Overview

**Workspaces declare named slots. Mods register reusable blocks and buttons. Bindings connect blocks/buttons to slots. The slot's renderer owns all rendering, layout, lifecycle, and event routing.**

```
WORKSPACE (host)                      MOD (contributor)
──────────────                        ─────────────────

declareSlot({                         registerBlock({
  id: "eln.header.actions",             id: "eln.export",
  accepts: "button",                   label: "Export Table",
  renderer: ButtonGroupRenderer,       icon: ExportIcon,
  layout: "horizontal",                component: ExportTableBlock,
  defaults: {},                        listensTo: [],
  order: 0,                            onEvent: {},
})                                    })

                                     registerButton({
declareSlot({                           id: "eln.export",
  id: "eln.editor",                    label: "Export",
  accepts: "block",                    icon: Download,
  renderer: TipTapRenderer,            onClick: ({ bus }) => bus.collect("data.export"),
  layout: "vertical",                 })
  defaults: { nodeType: "block", atom: true },
  order: 1,                           registerIntoSlot("eln.header.actions", "eln.export")
})                                    registerIntoSlot("eln.editor", "eln.table")
```

The block (`eln.table`) is a type. The slot (`eln.editor`) owns the rendering strategy (TipTap). The binding connects them with optional overrides. The same block can be bound to multiple slots — it renders as a TipTap node in the editor and as a card in the sidebar, without the block author writing any rendering-mode-specific code.

---

## Registration API

### registerBlock()

Register a reusable block type. A block is a type — registered once, bindable into many slots.

```typescript
registerBlock({
  id: string;                          // "eln.table" — unique, drives action_type derivation
  label: string;                       // "Table" — shown in slash menu, tabs, etc.
  icon: ComponentType;                 // Lucide icon
  component: ComponentType<BlockComponentProps>;  // React component
  listensTo: string[];                 // events this block reacts to (default: [])
  onEvent: Record<string, (instance: BlockInstance, payload: unknown) => unknown | void>;
  messages?: {                         // activity feed message overrides
    created?: string;
    edited?: string;
    deleted?: string;
  };
  getDisplayName?: (attrs: Record<string, unknown>) => string;
  tags?: string[];                     // for block picker filtering
  serialize: (state: Record<string, unknown>) => string;      // state → JSON
  deserialize: (json: string) => Record<string, unknown>;     // JSON → state
  defaultState: Record<string, unknown>;                      // used when no stored content
})
```

### registerButton()

Register a simple fire-only trigger rendered by button-group and toolbar slots.

```typescript
registerButton({
  id: string;                          // "eln.export"
  label: string;                       // "Export"
  icon?: ComponentType;                // Lucide icon
  onClick: (args: { bus: WorkspaceBus; context: SlotContext }) => void;
})
```

Buttons are fire-only — they emit events via `bus.collect()`/`bus.emit()`/`bus.request()` but never listen. If a UI element needs to both listen and fire, use a block.

### declareSlot()

Declare a named placeholder in a workspace. The slot's renderer owns how things are rendered.

```typescript
declareSlot({
  id: string;                          // "eln.editor" — {workspaceId}.{region}.{name}
  accepts: "block" | "button";         // what can be bound into this slot
  renderer: ComponentType<RendererProps>;  // the rendering strategy
  layout: "horizontal" | "vertical";   // how contents are arranged
  order: number;                       // slot position within workspace
  defaults: Record<string, unknown>;   // default overrides for bindings (default: {})
})
```

**Renderer catalog (built-in):**

| Renderer | `accepts` | Layout | Use case |
|----------|-----------|--------|----------|
| `TipTapRenderer` | `block` | `vertical` | Editor content — wraps blocks as TipTap nodes, emits lifecycle events |
| `ButtonGroupRenderer` | `button` | `horizontal` | Header toolbars — renders buttons with their `onClick` handlers |
| `PanelRenderer` | `block` | `vertical` | Sidebar panels — renders blocks as stacked panels |
| `TabRenderer` | `block` | `vertical` | Tabbed interfaces — uses block's `label` as tab name |

New renderers can be built without changing the slot system. The renderer catalog is the slot type taxonomy — no separate `type` field needed.

### registerIntoSlot()

Bind a block or button into a slot, with optional per-binding overrides.

```typescript
registerIntoSlot(
  slotId: string,                      // "eln.editor"
  targetId: string,                    // "eln.table" (block or button ID)
  overrides?: Record<string, unknown>  // merged with slot defaults; overrides win
): void;

// Order is a per-binding override, not a slot default:
registerIntoSlot("eln.header.actions", "eln.export", { order: 0 });
registerIntoSlot("eln.header.actions", "eln.lock", { order: 1 });
```

---

## Slot Declarations & Renderers

### How slots work

1. Workspace declares a slot with a renderer + defaults
2. Mods register blocks/buttons
3. Mods bind blocks/buttons into slots via `registerIntoSlot()`
4. `SlotRenderer` resolves the slot → looks up bindings → resolves targets → merges defaults with overrides → passes to renderer
5. Renderer renders everything, owns layout/lifecycle/event routing

### Layout direction

- `"horizontal"`: items arranged left-to-right, low `order` = leftmost. Used by `ButtonGroupRenderer` for toolbars.
- `"vertical"`: items stacked top-to-bottom, low `order` = topmost. Used by `TipTapRenderer` for editor content, `PanelRenderer` for sidebars.

### Slot ID convention

`"{workspaceId}.{region}.{name}"` — e.g., `"eln.header.actions"`, `"eln.editor"`, `"eln.sidebar"`. The ID displays the slot's origin and can be referenced anywhere, but the ID is the single source of truth for binding.

---

## Slot Bindings

### Defaults + Overrides merge

Slot defaults provide lazy registration — bindings that don't specify overrides get the slot's defaults. Per-binding overrides replace slot defaults on a per-key basis.

```typescript
// Slot declaration
declareSlot({
  id: "eln.editor",
  accepts: "block",
  renderer: TipTapRenderer,
  defaults: { nodeType: "block", atom: true },
})

// Uses slot defaults: { nodeType: "block", atom: true }
registerIntoSlot("eln.editor", "eln.table")

// Overrides one key: { nodeType: "inline", atom: false }
registerIntoSlot("eln.editor", "eln.mention", { nodeType: "inline", atom: false })
```

The resolved binding is what the renderer receives. The renderer never sees raw slot defaults or raw binding overrides — it gets the merged result.

### Order

`order` is a per-binding override, not a slot default. The same block might want different positions in different slots. Buttons: `order: 0` = leftmost in horizontal toolbars. Blocks: `order: 0` = topmost in vertical stacks.

---

## The Renderer Contract

Every renderer receives the same contract:

```typescript
interface RendererProps<T extends BaseBinding = BaseBinding> {
  bindings: T[];
  bus: WorkspaceBus;
  context: SlotContext;
}

interface BaseBinding {
  order: number;
}

// Button binding — what ButtonGroupRenderer receives
interface ButtonBinding extends BaseBinding {
  type: "button";
  id: string;
  label: string;
  icon?: ComponentType;
  onClick: (args: { bus: WorkspaceBus; context: SlotContext }) => void;
}

// Block binding — what TipTapRenderer, PanelRenderer, TabRenderer receive
interface BlockBinding extends BaseBinding {
  type: "block";
  id: string;
  label: string;
  icon: ComponentType;
  component: ComponentType<BlockComponentProps>;
  listensTo: string[];
  onEvent: Record<string, (instance: BlockInstance, payload: unknown) => unknown | void>;
  messages?: { created?: string; edited?: string; deleted?: string };
  getDisplayName?: (attrs: Record<string, unknown>) => string;
  tags?: string[];
  overrides: Record<string, unknown>;  // merged from slot defaults + binding overrides
}
```

### BlockComponentProps

The props every block component receives from the renderer:

```typescript
interface BlockComponentProps {
  context: SlotContext;
  instance: BlockInstance;
}
```

No `bus` — blocks respond to events via `onEvent` handlers, they never initiate bus calls. Buttons (which fire events) receive `bus` in their `onClick`; blocks (which respond) use `onEvent`.

### BlockInstance

A handle to a specific occurrence of a block, created by the renderer:

```typescript
interface BlockInstance {
  id: string;            // unique instance ID
  blockId: string;       // "eln.table" — which block type
  slotId: string;        // "eln.editor" — which slot this instance lives in
  attrs: Record<string, unknown>;    // deserialized block state
  updateAttrs: (attrs: Record<string, unknown>) => void;  // full replacement, triggers serialize
}
```

`attrs` is the deserialized state — the block component works with native JS objects, not JSON strings. `serialize`/`deserialize` (from `registerBlock()`) are the bridge. `updateAttrs` replaces state entirely (no merging — that's the block's responsibility), triggers serialization + persist, and (in editor slots) emits a lifecycle event.

### SlotContext

Flat bag of what's available. Blocks check for what they need:

```typescript
interface SlotContext {
  workspaceId: string;
  user: UserInfo;
  viewMode: ViewMode;
  entryId?: string;
  entityId?: string;
  displayId?: string;
}
```

### Renderer-specific behavior: TipTapRenderer

The `TipTapRenderer` is the most complex renderer. It:

1. Iterates resolved block bindings, generates a `NodeSpec` for each from `binding.id` + `binding.component` + `binding.overrides` (nodeType → group, atom setting)
2. Builds the ProseMirror schema at editor mount time (deferred until all blocks are registered)
3. Creates NodeViews that mount the block's React component, passing BlockComponentProps
4. Uses `serialize`/`deserialize` from the block registration to store block state as a single opaque `content` attribute
5. On block insert → deserializes `defaultState` if no stored content
6. On block mount → emits `"{mod}.{block}.created"` on bus
7. On block content change → emits `"{mod}.{block}.edited"` on bus
8. On block removal → emits `"{mod}.{block}.deleted"` on bus
9. Routes events to blocks: subscribes to `bus.on()` for each binding's `listensTo` events, calls the matching `onEvent` handler with `(instance, payload)`, captures return values for `collect()`/`request()`
10. Handles async `onEvent` handlers — awaits before passing return value to bus

Block authors never call `bus.emit()` — the renderer is the framework.

### Renderer-specific behavior: ButtonGroupRenderer

Renders buttons horizontally sorted by `order`. Each button's DOM element fires its `onClick` handler. The button author writes bus interaction code inside `onClick` — the renderer just wires the click handler. Buttons are fire-only; no lifecycle events, no `listensTo`.

### Renderer-specific behavior: PanelRenderer

Renders blocks vertically as stacked panels. No lifecycle events — a block in a sidebar isn't "created" or "deleted," it's just rendered or not. Event routing works the same: subscribes to `bus.on()` for each binding's `listensTo`, routes to `onEvent` handlers.

### Renderer-specific behavior: TabRenderer

Renders blocks as tabs in a tabbed interface. Uses each block's `label` as tab name and `icon` as tab icon. Vertical layout — tabs stacked. Same event routing as PanelRenderer.

---

## Workspace Event Bus

**Every piece of communication is a message on the workspace bus. Three methods. One pattern.**

```typescript
interface WorkspaceBus {
  /** Subscribe to an event. Returns an unsubscribe function. Handler return values
   *  are captured by collect()/request() — emit() ignores them. */
  on(event: string, handler: (payload: unknown) => unknown | void): () => void;

  /** Fire and forget. Delivers to all listeners. */
  emit(event: string, payload?: unknown): void;

  /** Fire and collect. Waits for all listeners to respond. Returns array of results. */
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

### Event routing

The bus is **workspace-scoped and cross-slot.** A button in `"eln.header.actions"` fires `bus.collect("data.export")`, and a block in `"eln.editor"` with `listensTo: ["data.export"]` receives it. Event routing is bus-wide, not slot-local.

**Blocks** declare what they listen to via `listensTo` + `onEvent`. Each renderer subscribes to `bus.on()` for its blocks' events and routes to the matching `onEvent` handler. The renderer owns registration/unregistration as blocks are mounted/unmounted.

**Components** subscribe imperatively via `bus.on(event, handler)` inside `useEffect`. Mounting = subscribing, unmounting = unsubscribing.

**The workspace shell** subscribes to lifecycle events for cross-cutting concerns (action logging, lock management, auto-save). These listeners are set up when the workspace mounts.

### No `registerEventListener()`

Two patterns only: declarative `listensTo` + `onEvent` for blocks; imperative `bus.on()` for components and the workspace shell. No third API surface.

---

## Block Lifecycle & Action Logging

### Lifecycle events (framework-emitted, never block-emitted)

`TipTapRenderer` emits these automatically. Block authors never call `bus.emit()`.

| Event | Payload | When |
|-------|---------|------|
| `{mod}.{block}.created` | `{ blockId, slotId, blockInstanceId, attrs }` | Block inserted into editor |
| `{mod}.{block}.edited` | `{ blockId, slotId, blockInstanceId, changedAttrs }` | Block content changed |
| `{mod}.{block}.deleted` | `{ blockId, slotId, blockInstanceId }` | Block removed from editor |

All three always fire — no opt-out. Message overrides available, not event suppression.

Only the `TipTapRenderer` emits lifecycle events. `PanelRenderer` and `TabRenderer` do not — blocks in sidebars or tabs aren't "created" or "deleted," they're just rendered.

### Event naming

Triple-dotted: `"{mod}.{target}.{verb_past}"`. Same string on bus, in DB action_type column, and in UI subscriptions.

### Action type derivation

Mechanical, zero-ceremony. Block author only provides `messages` overrides and `getDisplayName`.

```
Block ID: "eln.table"
Lifecycle verb: edited
Action type: "eln.table.edited"
```

### Action logging path

```
ProseMirror transaction commits (block inserted/changed/removed)
    │
    ▼
TipTapRenderer detects block node affected
    │
    ▼
TipTapRenderer emits "{mod}.{block}.{verb}" on WorkspaceBus
    │
    ├──▶ Workspace shell's action-logging listener:
    │      - Receives event
    │      - Derives action_type from event name (same string)
    │      - Derives mod from block ID's first segment for routing to correct action table
    │      - Derives human-readable message from block's messages config or default template
    │      - POST /api/{mod}/entries/{entryId}/actions/
    │
    ├──▶ ActivityFeed component (bus.on subscriber):
    │      - Optimistically prepends action to feed
    │
    └──▶ Future consumers (notifications, audit export, etc.)
```

### Message derivation

```
Default template:      "{label} was {verb_past}"  → "Table was edited"
With getDisplayName:   "{label} '{name}' was {verb_past}" → "Table 'Samples' was edited"
With messages override: uses custom string          → "spreadsheet was updated"
```

### Action table routing

Derived from the block ID's first segment: `"eln.table"` → mod = `"eln"` → writes to `ElnAction` table. `"lims.data-table"` → mod = `"lims"` → writes to LIMS `Action` table. The derivation rule handles cross-mod blocks.

---

## SlotRenderer Component

Thin resolution component. Receives a slot ID, bus, and context. Delegates to the renderer.

```
<SlotRenderer slotId="eln.editor" bus={bus} context={context} />
```

1. Looks up `registry.slots.get("eln.editor")` → `{ renderer: TipTapRenderer, defaults: { nodeType: "block", atom: true }, ... }`
2. Looks up `registry.bindings.get("eln.editor")` → `[{ targetId: "eln.table", overrides: {}, order: 0 }, ...]`
3. Resolves each binding: looks up target in `blocks` or `buttons` (based on slot's `accepts`), merges slot defaults with binding overrides
4. Renders: `<TipTapRenderer bindings={resolvedBindings} bus={bus} context={context} />`

The workspace shell creates one bus instance per workspace and passes the same bus to every `SlotRenderer`.

---

## Registry Shapes

### ModRegistry additions

The existing `ModRegistry` singleton gains four new stores and methods:

```
slots: Map<string, SlotDeclaration>
buttons: Map<string, ButtonRegistration>
bindings: Map<string, SlotBinding[]>  // keyed by slotId
// blocks already exists — BlockConfig shape changes to match new model
```

### Type shapes

```typescript
interface SlotDeclaration {
  id: string;                    // "eln.editor"
  accepts: "block" | "button";
  renderer: ComponentType<RendererProps>;
  layout: "horizontal" | "vertical";
  order: number;
  defaults: Record<string, unknown>;
}

interface BlockRegistration {
  id: string;                    // "eln.table"
  label: string;
  icon: ComponentType;
  component: ComponentType<BlockComponentProps>;
  listensTo: string[];
  onEvent: Record<string, (instance: BlockInstance, payload: unknown) => unknown | void>;
  messages?: { created?: string; edited?: string; deleted?: string };
  getDisplayName?: (attrs: Record<string, unknown>) => string;
  tags?: string[];
  serialize: (state: Record<string, unknown>) => string;
  deserialize: (json: string) => Record<string, unknown>;
  defaultState: Record<string, unknown>;
}

interface ButtonRegistration {
  id: string;                    // "eln.export"
  label: string;
  icon?: ComponentType;
  onClick: (args: { bus: WorkspaceBus; context: SlotContext }) => void;
}

interface SlotBinding {
  slotId: string;                // "eln.editor"
  targetId: string;              // "eln.table" (block ID or button ID)
  overrides: Record<string, unknown>;
  order: number;
}
```

### What the existing `BlockConfig` becomes

The current `BlockConfig` (type-discriminated with `type` + `payload`) is replaced by the new `BlockRegistration`. The `type: "tiptap-node"` discriminator dissolves — blocks are no longer TipTap-specific. A block is a block; the renderer determines presentation.

The existing `registerBlock()` call sites (currently only `eln.table`) migrate to the new shape.

---

## Validation

At boot (during `ModRegistry.validate()`):

1. **Slot must be declared before bindings target it.** If a binding targets an undeclared slot, log a console warning and skip the binding.
2. **Binding target must match slot's `accepts`.** If a slot `accepts: "block"` and the target is a button, log a console warning and skip the binding.
3. **Binding target must exist in the registry.** If the target ID isn't a registered block or button, log a console warning and skip.
4. **Duplicate slot IDs / block IDs / button IDs** — throw (same pattern as existing registry methods).

Failure mode: **console warning in production, skip the bad binding.** No crash. The slot renders what it can.

TypeScript prevents most mismatches at dev time; runtime validation catches plain-JS or misconfigured external mods.

---

## Rollout Sketch

1. Add `WorkspaceBus` — scoped to workspace instance, `on()`/`emit()`/`collect()`/`request()`
2. Add new `registerBlock()` shape and `registerButton()` to `ModRegistry`
3. Add `declareSlot()` with renderer + defaults
4. Add `registerIntoSlot()` for bindings
5. Add `SlotRenderer` component — resolves slot + bindings, delegates to renderer
6. Build `TipTapRenderer` — first renderer, handles block lifecycle events + event routing
7. Build `ButtonGroupRenderer` — header toolbars
8. Convert ELN workspace header to a slot, dogfood with one button
9. Convert ELN editor to `"block-container"` slot with `TipTapRenderer`
10. Build `PanelRenderer` — sidebar panels
11. Convert sidebar to slots
12. Wire up workspace shell's action-logging listener
13. Migrate existing `registerBlock()` call sites to new shape
14. Remove old `BlockConfig` type + `BLOCK_TYPE_TIPTAP_NODE`

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Slot taxonomy | Renderer-based — no fixed type enum | Renderer IS the type. New renderers added without changing the slot system. |
| Block rendering | Slot owns the renderer; block owns the component | Same block renders in editor, sidebar, and tabs without the block author writing rendering-mode code. |
| Buttons vs blocks | Two registration functions | Buttons are fire-only, no component. Blocks have components + lifecycle. Same slot pattern, different targets. |
| BlockComponentProps | `{ context, instance }` — no `bus` | Blocks respond to events via `onEvent`, never initiate. Buttons get `bus` in `onClick`. Clean separation. |
| Block serialization | `serialize`/`deserialize` + opaque `content` attribute | Renderer doesn't need to know internal block state shape. Block author writes serialization once. |
| `updateAttrs` | Full replacement, not merge | Simpler contract. Merging is the block's responsibility. |
| Lifecycle events | Renderer-emitted, only by TipTapRenderer | Editor is the only context where blocks are "created"/"deleted." Sidebar/tab blocks just render. |
| Event routing | Renderer owns routing for its blocks | Renderer subscribes to `bus.on()` for each block's `listensTo`, routes to `onEvent`. Manages mount/unmount lifecycle. |
| Bus scope | Workspace-scoped, cross-slot | Button in toolbar slot talks to block in editor slot. Bus is the shared pipe. |
| Listener patterns | Declarative (`listensTo`+`onEvent`) for blocks; imperative (`bus.on()`) for components | Blocks are the common case and need renderer routing. Components use standard React patterns. |
| Event naming | Triple-dotted `"{mod}.{target}.{verb_past}"` | Same string on bus, in DB action_type, in UI subscriptions. |
| Action logging ownership | Workspace shell, not renderer | Renderer emits facts; workspace translates facts into action log entries. |
| Slot ID convention | `"{workspaceId}.{region}.{name}"` | Displays origin; used as binding target. Single source of truth. |
| Slot defaults + binding overrides | Merged per-key; binding overrides win | Lazy registration (use defaults) with escape hatches (override per binding). |
| Validation failure mode | Console warning + skip binding, no crash | Devs notice; production degrades gracefully for bad external mod bindings. |
| No `maxItems` on slots | Removed | Editor slots need unlimited blocks; header slots self-limit by number of buttons registered. |
| No `registerEventListener()` | Blocks: `listensTo`+`onEvent`. Components: `bus.on()`. | Two patterns, no third API surface. |
| Flat registrations stay | `registerHub()`, `registerRoute()`, `registerSettingsSection()`, etc. unchanged | Slots for embedded UI extension only. App-level concerns keep flat registrations. |

---

## References

- [Mod System Architecture](mod-system.md) — existing registration API this extends
- [Actions System Design](actions-system-design.md) — action logging built on this event system
- [Cross-Cutting Events](cross-cutting-events.md) — reconciliation doc: event naming, block→action path, service boundaries
- [Grilling Alignment](grilling-alignment.md) — hard constraints for all design docs
