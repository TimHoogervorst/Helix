# ADR-0012: TipTapRenderer as Sole Editor Host — Dissolving the Host-Component Anti-Pattern

> Date: 2026-07-30
> Status: Accepted
> Companion specs: [Spec: TipTapRenderer as sole editor host](https://github.com/TimHoogervorst/Helix/issues/348), [Spec: Declarative bus subscriptions & unified action pipeline](https://github.com/TimHoogervorst/Helix/issues/349)
> Related: [ADR-0011](0011-declarative-bus-subscriptions.md) (bus unification)

---

## Context

The slot system has two renderers that work correctly and one that does not. `PanelRenderer` and `ButtonGroupRenderer` are instantiated by `SlotRenderer` — the `renderer` field on the slot declaration IS the component that gets rendered. `TipTapRenderer` is declared as the renderer for `eln.editor` but is never instantiated. `ElnEditor` bypasses it entirely, creating its own TipTap instance via `useEditor()` and duplicating the renderer's slot resolution logic in `createElnExtensions`.

Additionally, `useBlockActionLogging` lives at the workspace level (`ElnWorkspace`), accumulating block lifecycle events and flushing them to `POST /api/actions/` on save. This logic is separated from the renderer that owns the lifecycle emissions by a bus — the bus bridges a distance in the component tree that shouldn't exist.

Three approaches were considered:

| Approach | Editor ownership | Accumulation location | Duplication |
|---|---|---|---|
| **Status quo — host component pattern** | `ElnEditor` owns `useEditor()` | Workspace-level hook | `createElnExtensions` duplicates slot resolution |
| **Pass bus to editor** (rejected) | `ElnEditor` still owns everything | Still at workspace level | Still duplicates |
| **TipTapRenderer as sole host** (chosen) | `TipTapRenderer` owns `useEditor()` | Inside `TipTapRenderer` | None — slot resolution happens once in `SlotRenderer` |

---

## Decision

**`TipTapRenderer` becomes the actual, instantiated component for the editor slot. `ElnEditor` shrinks to chrome-only (title, description, tags, metadata). `createElnExtensions` is deleted. `useBlockActionLogging` dissolves into a `useActionAccumulator` hook inside `TipTapRenderer`.**

### TipTapRenderer gains props

The renderer accepts additional props to support workspace-specific customization:

| Prop | Type | Purpose |
|---|---|---|
| `extensions` | `Extension[]` | Additional TipTap extensions (mentions, table kit, etc.) merged with internal StarterKit + block node wiring |
| `onCreate` | `(editor: Editor) => void` | Called with the editor instance for ref access |
| `onUpdate` | `(editor: Editor) => void` | Called on content changes for content tracking |
| `editable` | `boolean` | Lock-based read-only control |
| `saveSignal` | `unknown` | When this value transitions, accumulated actions are flushed |
| `targetId` | `number` | Numeric target ID for `sendAction` calls |
| `onFlushActions` | `(actions: AccumulatedAction[]) => Promise<boolean>` | The `sendAction` function for flushing to `POST /api/actions/` |

### `useActionAccumulator` inside TipTapRenderer

This internal hook owns what `useBlockActionLogging` currently owns:
- Accumulating lifecycle events (block created/edited/deleted) via internal callbacks from `BlockNodeView`
- Accumulating custom action events (from block `emits`) via bus subscriptions
- Deduplication by `(blockInstanceId, verb)`
- Action catalog label resolution
- Flushing on save signal transition → `onFlushActions` → `POST /api/actions/`
- Emitting `{workspaceId}.action.performed` on the bus with resolved action items on successful flush

### Lifecycle events become internal callbacks

`BlockNodeView` no longer calls `bus.emit("{blockId}.created", ...)`. It calls a callback passed from `TipTapRenderer` (or pushes into a shared ref). Lifecycle tracking is a parent-child concern within the renderer component tree. See ADR-0011 for the bus event changes.

### What dissolves

| Removed | Disposition |
|---|---|
| `createElnExtensions` | Deleted. Extensions passed as `extensions` prop |
| `useBlockActionLogging` | Deleted. Logic moves into `useActionAccumulator` inside `TipTapRenderer` |
| `ElnEditor` (as editor owner) | Shrinks to chrome-only (~150 lines from ~500). May dissolve into `ElnWorkspace` |

### Slot system: renderer AS the component

The `renderer` field on a slot declaration IS the component that gets rendered. It is not a swappable plugin — it is the canonical host for blocks in that slot. A renderer swap would mean a fundamentally different UI paradigm, not a drop-in replacement. The term "renderer" stays — it accurately describes a component that receives bindings and renders them.

---

## Rationale

### Why the renderer must own the editor

When `ElnEditor` owns `useEditor()`, it must also own slot resolution (to know which blocks to register as TipTap nodes). That duplicates the core logic of `TipTapRenderer`. And because the editor lifecycle is outside the renderer, action accumulation (which depends on block lifecycle events) must live at the workspace level, bridged by the bus. Moving `useEditor()` into `TipTapRenderer` collapses three components that should be one (editor instance, block node wiring, action accumulation) into a single ownership domain.

### Why extensions as props, not a workspace function

`createElnExtensions` was a function that called `ModRegistry.resolveSlot("eln.editor")` and built a TipTap extension array. Every workspace with an editor would need its own version. By making extensions a prop, the renderer handles slot resolution internally (it already receives bindings via `RendererProps`) and the workspace just passes the additional extensions it needs. The workspace controls what; the renderer controls how.

### Why accumulation moves into the renderer

`useBlockActionLogging` is a hook called from `ElnWorkspace`. It has no business at the workspace level — it's purely concerned with block lifecycle events, which are emitted by the renderer. The workspace shouldn't know or care how block actions are accumulated and flushed; it should only provide the `sendAction` function and the save signal. Moving accumulation into the renderer follows the principle that the component that emits events should own the downstream processing of those events.

### Why `ElnEditor` shrinks rather than dissolves entirely

After removing `useEditor()`, `createElnExtensions`, and the content-loading suppression gate, `ElnEditor` still owns the chrome around the editor: title bar, description textarea, tags section, metadata line, save orchestration. Whether these 150 lines merit their own file or can move into `ElnWorkspace` is an implementer judgment, not an architectural decision. The spec leaves this choice open.

---

## Consequences

### Benefits

- **One component for editor hosting.** `TipTapRenderer` is the editor host. Every workspace that needs a block editor uses it. No per-workspace editor duplication.
- **Simpler workspace code.** `ElnWorkspace` passes props to `TipTapRenderer` instead of instantiating `ElnEditor` which owns the full editor lifecycle.
- **Linear action pipeline.** Lifecycle events → accumulation → flush → bus event — all within `TipTapRenderer`. Debuggable in a single component tree.
- **Testable in isolation.** `TipTapRenderer` can be tested with mock extensions and a test bus without mounting an entire workspace.
- **New block types require zero editor changes.** Register a block, bind it into `eln.editor` — it appears. No extension list to update.

### Constraints

- **`TipTapRenderer` grows.** From ~200 lines to ~400+ lines with `useActionAccumulator` and the new props. The internal complexity is justified by eliminating duplication in every workspace.
- **`createElnExtensions` deleted.** Any code importing this function must be updated.
- **`useBlockActionLogging` deleted.** `ElnWorkspace` must pass `saveSignal`, `targetId`, and `onFlushActions` to `TipTapRenderer` instead.
- **`ElnEditor` significantly refactored.** The change is mechanical (move `useEditor()` out, move props through) but touches many lines.
- **`ElnWorkspace` adapts.** Must pass new props to `TipTapRenderer`. The workspace becomes a provider of infrastructure (bus, sendAction, save signal) rather than an owner of editor logic.

### Future considerations

- **Multi-editor workspaces.** A workspace could instantiate multiple `TipTapRenderer` instances (e.g., split-pane editing) — each with its own accumulation layer.
- **Editor-less workspaces.** Workspaces that don't need a TipTap editor (LIMS detail view, Library browser) are unaffected. `TipTapRenderer` is only used for slots that declare it as their renderer.
- **Custom editor renderers.** If a future workspace needs an editor with fundamentally different behavior (e.g., a code editor), it can register a different renderer for its editor slot. `TipTapRenderer` remains the standard for rich-text block editing.
