# Slot System & Workspace Event Bus

> Date: 2026-07-16
> Status: Accepted
> Companion to: [Mod System Architecture](mod-system.md)
>
> This document captures the design for the renderer-based slot system and workspace-scoped event bus. The slot system extends the mod API with three new registration functions (`declareSlot()`, `registerButton()`, `registerIntoSlot()`) and rewrites `registerBlock()` to be renderer-agnostic.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Core Concepts](#core-concepts)
3. [Slot Lifecycle](#slot-lifecycle)
4. [Registration API](#registration-api)
5. [Writing a Block Component](#writing-a-block-component)
6. [Renderers](#renderers)
7. [Workspace Event Bus](#workspace-event-bus)
8. [Block Serialization](#block-serialization)
9. [Defaults & Overrides](#defaults--overrides)
10. [Block-Level Action Logging](#block-level-action-logging)
11. [Validation](#validation)

---

## Problem Statement

The ELN workspace had no extension points for embedded UI. Mods couldn't contribute buttons, sidebar panels, or editor content blocks without the workspace hardcoding knowledge of every mod. Activity feeds, export buttons, and lock indicators were all tightly coupled to their owning mod. There was no event bus for decoupled communication between UI elements within a workspace.

The old `registerBlock()` was tied to TipTap — a `tiptap-node` type discriminator with `TipTapBlockPayload` that only the ELN editor could consume. Blocks couldn't render in sidebars, tabs, or any other context.

---

## Core Concepts

| Term | Definition |
|------|-----------|
| **Slot** | A named placeholder in a workspace that owns how things are rendered. Declared via `declareSlot()`. The slot's `renderer` field IS the type — there is no fixed enum of slot types. |
| **Block** | A reusable, renderer-agnostic content unit registered via `registerBlock()`. Can render in a TipTap editor, a sidebar panel, or a tab without the block author writing any rendering-mode-specific code. Blocks can listen to events on the workspace bus via declarative `listensTo` + `onEvent` handlers. |
| **Button** | A simple fire-only action registered via `registerButton()`. Buttons emit events via the workspace bus but never listen. If a UI element needs to both listen and fire, use a block. |
| **Binding** | The connection between a block/button and a slot, created by `registerIntoSlot()`. Carries per-binding overrides merged with slot defaults. |
| **Renderer** | The component that owns presentation within a slot. Receives resolved bindings via `RendererProps`. Different renderers present the same block differently: TipTapRenderer embeds it as a node, PanelRenderer renders it as a panel, TabRenderer renders it as a tab. |
| **Workspace Event Bus** | A scoped pub/sub bus tied to a workspace instance. Buttons emit events; blocks listen via declaration. Lifecycle events are renderer-emitted — block authors never call `bus.emit()`. |
| **Slot Context** | A flat bag of metadata (`workspaceId`, `user`, `viewMode`, `entryId`, `entityId`, `displayId`) available to every block and button in a workspace. |

---

## Slot Lifecycle

```
1. Workspace declares slots via declareSlot()
   → "eln.editor" (accepts: "block", renderer: TipTapRenderer)
   → "eln.toolbar" (accepts: "button", renderer: ButtonGroupRenderer)
   → "eln.sidebar" (accepts: "block", renderer: PanelRenderer)

2. Mods register blocks and buttons
   → registerBlock({ id: "eln.table", component: LimsTableBlock, ... })
   → registerButton({ id: "eln.export", onClick: ..., ... })

3. Mods bind into slots
   → registerIntoSlot("eln.editor", "eln.table", { order: 0 })
   → registerIntoSlot("eln.toolbar", "eln.export", { order: 5 })

4. At render time, SlotRenderer resolves each slot:
   a. Look up slot declaration → get renderer + defaults
   b. Look up bindings for slot → resolve targets (blocks or buttons)
   c. Merge slot.defaults ← binding.overrides (binding wins per-key)
   d. Pass { renderer, bindings, bus, context } to the renderer component
```

---

## Registration API

### declareSlot()

Declares a named placeholder in a workspace. The slot's `renderer` determines how bound content is presented.

```ts
declareSlot({
  id: string;                        // "{workspaceId}.{region}.{name}", e.g. "eln.editor"
  accepts: "block" | "button";      // What can be bound into this slot
  renderer: ComponentType<any>;      // The rendering strategy component
  layout: "horizontal" | "vertical"; // How contents are arranged
  order: number;                     // Slot position within the workspace
  defaults: Record<string, unknown>; // Default overrides applied to all bindings
}): void;
```

**Naming convention:** `{workspaceId}.{region}.{name}` — e.g. `eln.editor`, `eln.toolbar`, `eln.sidebar`, `lims.activity`.

### registerBlock()

Registers a reusable, renderer-agnostic content block. The same block can be bound into a TipTap editor slot, a sidebar panel slot, or a tab slot.

```ts
registerBlock({
  id: string;                                          // Globally unique, e.g. "eln.table"
  label: string;                                       // Human-readable, e.g. "Table"
  icon: ComponentType<any>;                             // Lucide icon
  component: ComponentType<BlockComponentProps>;        // React component
  listensTo: string[];                                  // Events this block reacts to (default: [])
  onEvent: Record<string, (instance: BlockInstance, payload: unknown) => unknown | void>;
  messages?: {                                          // Activity feed message overrides
    created?: string;
    edited?: string;
    deleted?: string;
  };
  getDisplayName?: (attrs: Record<string, unknown>) => string;
  tags?: string[];                                      // For block picker / slash menu filtering
  serialize: (state: Record<string, unknown>) => string;
  deserialize: (json: string) => Record<string, unknown>;
  defaultState: Record<string, unknown>;                // Default state when no stored content exists
}): void;
```

**BlockComponentProps** — the contract every block component receives:

```ts
interface BlockComponentProps {
  context: SlotContext;        // workspaceId, user, viewMode, entryId, entityId, displayId
  instance: BlockInstance;     // id, blockId, slotId, attrs, updateAttrs()
  bus?: WorkspaceBus;          // Only present when rendered by PanelRenderer (not TipTap or Tab)
}
```

**Contrast with old API:** The old `registerBlock()` accepted a `type: "tiptap-node"` discriminator with `TipTapBlockPayload` (`node`, `defaultAttrs`). Blocks were TipTap-only. The new API is renderer-agnostic — the block provides a React component and the slot's renderer owns presentation.

### registerButton()

Registers a simple fire-only button rendered in toolbar slots.

```ts
registerButton({
  id: string;                                          // Globally unique, e.g. "eln.export"
  label: string;                                       // Human-readable, e.g. "Export"
  icon?: ComponentType<any>;                            // Optional Lucide icon
  onClick: (args: { bus: WorkspaceBus; context: SlotContext }) => void;
}): void;
```

Buttons emit events via `bus.collect()` / `bus.emit()` / `bus.request()` but never listen. They receive the bus in their `onClick` handler, not as a prop.

### registerIntoSlot()

Binds a block or button into a declared slot, with optional per-binding overrides.

```ts
registerIntoSlot(
  slotId: string,                    // The slot to bind into, e.g. "eln.editor"
  targetId: string,                  // The block or button ID, e.g. "eln.table"
  overrides: Record<string, unknown>, // Per-binding overrides (merged with slot defaults)
  order: number,                     // Position within the slot (lower = earlier)
): void;
```

Overrides are merged with slot defaults; binding overrides win on a per-key basis.

---

## Writing a Block Component

The idiomatic way to write a block component is with `createBlockAdapter`:

```ts
import { createBlockAdapter } from "@/shell/src/mod-system/createBlockAdapter";

const MyBlockContent = ({ title, items, updateAttrs }: MyBlockContentProps) => {
  // Pure rendering logic — no attrs extraction, no BlockComponentProps.
  return <div>...</div>;
};

export const MyBlockComponent = createBlockAdapter(
  MyBlockContent,
  ({ instance }) => {
    const attrs = instance.attrs as Record<string, unknown>;
    return {
      title: (attrs.title as string) ?? "Default Title",
      items: (attrs.items as MyItem[]) ?? [],
      updateAttrs: instance.updateAttrs,
    };
  },
);
```

The factory receives your inner content component and an extractor that maps full `BlockComponentProps` to the inner component's typed props. It returns a `ComponentType<BlockComponentProps>` — what `registerBlock()` expects.

**Why the extractor sees full props.** Most blocks only destructure `instance`, but some (like the registry table) need `context` (for `viewMode`, `emitAction`) or `overrides`. The full-props extractor keeps the same idiom for all blocks.

**`updateAttrs` is explicit.** The extractor must return `updateAttrs` — the factory does not auto-inject it. This keeps the factory generic over any inner-props shape.

**For anchored popovers**, use `PickerPortal` (from shell shared components) alongside `usePickerPortal` (from shell shared hooks) — the documented convention for pickers that portal to the document body, positioned relative to a trigger button.

---

## Renderers

Renderers are the components that own presentation within a slot. The slot's `renderer` field IS the type — no fixed enum. Each renderer receives `RendererProps`:

```ts
interface RendererProps<T extends BaseBinding = BaseBinding> {
  slotId: string;
  bindings: T[];           // Resolved BlockBinding[] or ButtonBinding[]
  bus: WorkspaceBus;
  context: SlotContext;
}
```

### Built-in Renderers

| Renderer | Accepts | Behavior |
|----------|---------|----------|
| **TipTapRenderer** | `"block"` | Embeds blocks as TipTap NodeViews within the editor document. Does NOT pass `bus` to blocks — editor blocks use declarative `onEvent` handlers. |
| **PanelRenderer** | `"block"` | Renders blocks as panels in a sidebar or detail area. PASSES `bus` to blocks — panels can use imperative subscriptions. |
| **TabRenderer** | `"block"` | Renders blocks as tabs. Does NOT pass `bus` — tabs use declarative handlers. |
| **ButtonGroupRenderer** | `"button"` | Renders buttons as a horizontal button group. Passes `bus` in the `onClick` handler. |

### How a Block Renders in Different Contexts

The same `"eln.table"` block:
- In a **TipTapRenderer** slot → embedded as an AG Grid NodeView in the editor
- In a **PanelRenderer** slot → rendered as a standalone panel with its own scroll
- In a **TabRenderer** slot → rendered as a tab with its own layout

The block author writes ONE `component` — the renderer handles the rest.

---

## Workspace Event Bus

A scoped pub/sub bus tied to a workspace instance. Provides decoupled communication between UI elements.

### Bus Methods

```ts
interface WorkspaceBus {
  /** Queue an event for batch emission on save. Used for block lifecycle events. */
  collect(event: string, payload: unknown): void;

  /** Emit an event immediately. Used for non-lifecycle UI events. */
  emit(event: string, payload: unknown): void;

  /** Emit an event and wait for async handlers to complete. */
  request(event: string, payload: unknown): Promise<unknown[]>;

  /** Subscribe to an event. Returns an unsubscribe function. */
  on(event: string, handler: (payload: unknown) => void): () => void;
}
```

### Event Naming Convention

Triple-dotted: `"{mod}.{target}.{verb}"`. Examples:
- `"eln.block.created"` — a block instance was created
- `"eln.block.edited"` — a block instance was edited
- `"eln.block.deleted"` — a block instance was deleted
- `"eln.table.row-added"` — a row was added to a LimsTable
- `"eln.export.requested"` — export button clicked

### Lifecycle Events

Lifecycle events are **renderer-emitted** — block authors never call `bus.emit()` for lifecycle. The renderer detects block creation, edit, and deletion and emits the appropriate events. The block merely declares what it listens to via `listensTo` and provides handlers via `onEvent`.

```ts
// Block declares what it cares about
registerBlock({
  id: "eln.table",
  listensTo: ["eln.block.edited", "library.folder.moved"],
  onEvent: {
    "eln.block.edited": (instance, payload) => {
      // React to own edit — e.g., sync entity data
    },
    "library.folder.moved": (instance, payload) => {
      // React to cross-block event
    },
  },
});
```

**Principle: pit of success.** Block authors can't forget to emit lifecycle events because they never emit them — the renderer does.

---

## Block Serialization

Blocks must serialize/deserialize their state for TipTap JSON persistence. The block author provides `serialize` and `deserialize` functions.

```ts
registerBlock({
  id: "eln.table",
  defaultState: { columns: [], rows: [] },
  serialize: (state) => JSON.stringify(state),
  deserialize: (json) => JSON.parse(json),
});
```

In non-TipTap renderers (PanelRenderer, TabRenderer), serialization is not used — blocks maintain their own state via `instance.updateAttrs()`.

---

## Defaults & Overrides

Slots declare `defaults` that apply to all bindings. Bindings provide `overrides` that win on a per-key basis. The merge happens at resolution time in `ModRegistry.resolveSlot()`.

```ts
// Slot declares a default icon size for all blocks
declareSlot({
  id: "eln.sidebar",
  defaults: { iconSize: "md", collapsible: true },
  // ...
});

// Binding overrides the icon size for this specific block
registerIntoSlot("eln.sidebar", "activity.feed", { iconSize: "lg" });
// Resolved: { iconSize: "lg", collapsible: true }
```

---

## Block-Level Action Logging

Blocks can declare action log messages for lifecycle events. When a block's `messages` are set, the workspace shell translates create/edit/delete lifecycle events into batched action log API calls on save.

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

Action types follow the triple-dotted convention: `"eln.block.created"`, `"eln.block.edited"`, `"eln.block.deleted"`. The ActivityFeed block reads from the action log and renders actions from any mod.

---

## Validation

The `ModRegistry.validate()` method checks slot bindings at boot:

1. **Slot must be declared** before bindings target it — otherwise the binding is skipped with a warning
2. **Target must exist** in blocks or buttons registry — otherwise skipped with a warning
3. **Target type must match slot's `accepts`** — a block bound to a `"button"` slot (or vice versa) is skipped with a warning

Invalid bindings are **skipped, not crashed** — the app boots but the offending content doesn't appear. This is intentional: a misconfigured binding shouldn't take down the whole application.

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Renderer owns presentation | Slot declares renderer; block provides component | Block authors write once, render anywhere |
| No slot type enum | `accepts: "block" \| "button"` with arbitrary renderer | Extensible without framework changes |
| Lifecycle events | Renderer-emitted, block-declared | Pit of success — block authors can't forget |
| Event naming | Triple-dotted: `mod.target.verb` | Consistent with action logging convention |
| Button = fire-only | Buttons emit, never listen | Clear separation: if you need to listen, use a block |
| Bus optional in BlockComponentProps | Only PanelRenderer passes `bus` | Editor blocks shouldn't imperatively subscribe to events |
| Defaults + overrides merge | Slot defaults ← binding overrides (binding wins) | Sensible defaults with per-binding customization |
| Validation is warn-and-skip | Bad bindings logged, app boots | Misconfiguration shouldn't be catastrophic |
