# ADR-0011: Declarative Bus Subscriptions — `listensTo`/`onEvent` as the Canonical Block API

> Date: 2026-07-30
> Status: Accepted
> Companion specs: [Spec: Declarative bus subscriptions & unified action pipeline](https://github.com/TimHoogervorst/Helix/issues/349), [Spec: TipTapRenderer as sole editor host](https://github.com/TimHoogervorst/Helix/issues/348)
> Related: [ADR-0009](0009-actions-api-gateway.md) (action endpoint design), [ADR-0008](0008-single-source-registration.md) (backend as authoritative source)

---

## Context

The block system has a `listensTo`/`onEvent` declarative subscription mechanism on `BlockRegistration` that is completely unused. Every block registers with `listensTo: []` and `onEvent: {}`. All bus subscriptions happen imperatively via `bus.on()` inside block components and hooks.

Three consumers currently use imperative subscriptions:

| Consumer | Mechanism | Category |
|---|---|---|
| `ActivityFeedBlock` | `bus.on()` in `useEffect`, iterates `ModRegistry.getBlocks()` | Block component |
| `useBlockActionLogging` | `bus.on()` in a React hook | Hook (system infrastructure) |
| `BlockNodeView` | `bus.emit()` for lifecycle events | Renderer (emitter, not consumer) |

Additionally, custom block actions flow through a completely separate pipeline: blocks call `sendAction()` directly (an HTTP POST at user-interaction time), bypassing the bus, the accumulation layer, and the save lifecycle. The same HTTP endpoint (`POST /api/actions/`), same data model — but different code paths, timing, and failure modes.

Three approaches were considered:

| Approach | Block API shape | Custom actions | Accumulation |
|---|---|---|---|
| **Status quo — imperative `bus.on()` + separate `sendAction()`** | Blocks call `bus.on()`, `bus.emit()`, and `sendAction()` directly | HTTP POST immediately, no accumulation | Hook at workspace level |
| **Hybrid — `listensTo` for peer blocks, imperative for system** | Two-tier: declarative for simple, imperative for cross-cutting | Still separate | Still hook |
| **Fully declarative — `listensTo` + `emits`** (chosen) | Blocks declare inputs and outputs; renderer wires everything | Bus events → accumulation → flush | Inside renderer |

---

## Decision

**`listensTo`/`onEvent` becomes the only way blocks subscribe to bus events. `BlockRegistration` gains an `emits` field for declaring custom actions. `bus` and `sendAction` are removed from `BlockComponentProps`. All action-producing code paths (lifecycle and custom) go through a unified accumulation → flush pipeline inside the renderer.**

### `listensTo`/`onEvent` as the canonical subscription

Blocks declare what events they react to and what handlers to invoke:

```typescript
interface BlockRegistration {
  listensTo: string[];
  onEvent: Record<string, (instance: BlockInstance, payload: unknown) => unknown | void>;
}
```

The renderer subscribes to bus events on the block's behalf and routes to handlers with the block's current instance. Both `BlockNodeView` (TipTapRenderer) and `useBlockInstance` (PanelRenderer, TabRenderer) already have this wiring — no renderer changes needed for the subscription mechanism itself.

`WorkspaceBus.on()` gains wildcard/glob matching. `*` matches a single dot-delimited segment; `**` matches any number of segments. `listensTo` inherits wildcard support since renderers call `bus.on()` under the hood.

### `emits` — declarative custom action emission

Blocks declare custom actions at registration time:

```typescript
interface BlockRegistration {
  emits: {
    id: string;     // local name, e.g. "row-added"
    label: string;  // human-readable, e.g. "Row Added"
    core: "created" | "edited" | "deleted";
  }[];
}
```

The system derives the global action ID: `{blockGlobalId}.{localId}`. Blocks emit custom actions via bus events (wired through typed handles per #344). The accumulation layer picks up custom action emissions alongside lifecycle events.

### Lifecycle events removed from the public bus

`{blockId}.created|edited|deleted` were emitted by `BlockNodeView` on the bus. They were consumed by exactly two things: `useBlockActionLogging` (accumulation) and `ActivityFeedBlock` (optimistic feed items). Both consumers will now get their data differently:

- **Accumulation**: after #345, `useActionAccumulator` lives inside `TipTapRenderer` — the same component tree as `BlockNodeView`. Lifecycle events become internal parent-child callbacks, not bus events.
- **ActivityFeedBlock**: subscribes to `{workspaceId}.action.performed` for resolved action items instead of raw lifecycle events.

The bus only carries events that cross component boundaries.

### Bus carries resolved action items

Instead of `eln.actions.flushed` (signal to refetch from API), the accumulation layer emits `{workspaceId}.action.performed` with a fully-resolved, ready-to-render action item:

```typescript
{
  action: string;       // e.g. "eln.table-block.created"
  actionType: string;   // e.g. "created"
  label: string;        // e.g. "Table created" (from action catalog)
  performedBy: ActionUser;
  createdAt: string;
  targetId: number;
  metadata: Record<string, unknown>;
}
```

`ActivityFeedBlock` subscribes to `eln.action.performed` via `listensTo` — one exact event name, no registry iteration, no catalog lookup. On initial page load, it still fetches historical actions from the API (covering other users/sessions). Bus events cover "what's happening right now in this session."

### `BlockComponentProps` stripped to essentials

```typescript
interface BlockComponentProps {
  context: SlotContext;
  instance: BlockInstance;
  overrides: Record<string, unknown>;
}
```

`bus` removed — blocks use `listensTo`/`onEvent` for incoming, `emits` for outgoing.
`sendAction` removed — called only by the accumulation layer inside the renderer.

### `sendAction` becomes infrastructure-only

Called exclusively by `useActionAccumulator` inside `TipTapRenderer`. Not exposed to blocks. The accumulation layer is the sole caller of `POST /api/actions/` on the frontend.

### Unified accumulation pipeline

`useActionAccumulator` (inside TipTapRenderer, per #345) processes lifecycle and custom actions identically:
1. Accumulate in a Map keyed by `(blockInstanceId, verb)` — same dedup for both
2. Resolve action catalog labels — one lookup path for both
3. On save signal → flush all via `onFlushActions` → `POST /api/actions/`
4. On successful flush → emit `{workspaceId}.action.performed` per action

Custom actions on new (unsaved) entries are no longer silently dropped — they accumulate alongside lifecycle events and flush on first save.

### Bus stays workspace-scoped

`WorkspaceBus` remains at the workspace level (`src/shell/src/workspace/`). Created by the workspace, passed to renderers. Not a global singleton. Hubs have static component trees — React context or callbacks suffice; they don't need a decoupled pub/sub bus.

---

## Rationale

### Why declarative subscriptions

Imperative `bus.on()` in blocks means every block author must understand the bus lifecycle: subscribe in `useEffect`, unsubscribe on cleanup, handle the ref for latest instance. Two blocks already get this wrong in different ways — `ActivityFeedBlock` has complex suppression gates and registry iteration; blocks that don't subscribe at all leave `listensTo: []` as dead code. A declarative API moves the wiring into the renderer (one place to get right) and lets block authors focus on what to do when an event fires, not how to subscribe.

### Why `emits` instead of `sendAction()` in blocks

`sendAction()` in blocks creates a parallel pipeline: lifecycle events accumulate and flush on save; custom actions POST immediately. This means custom actions on new entries are silently dropped (no `targetId` yet), failure handling is duplicated, and there's no coordination between the two pipelines (different `requestId`s, different timing). Moving custom actions to the bus unifies them with lifecycle actions into a single pipeline — one accumulation queue, one flush point, one error handling strategy.

### Why lifecycle events come off the bus

Lifecycle events were on the bus to bridge a distance in the component tree: `BlockNodeView` is deep inside `TipTapRenderer`, and `useBlockActionLogging` was at the `ElnWorkspace` level. The bus was the only channel between them. After #345 dissolves `useBlockActionLogging` into the renderer, the emitter and consumer are in the same component tree — the bus is unnecessary overhead for an intra-renderer signal.

### Why the bus carries resolved action items

Both `useBlockActionLogging` and `ActivityFeedBlock` independently perform the same action catalog lookup to derive a human-readable label from a machine-readable event name. That's a symptom of the bus carrying the wrong abstraction. By resolving labels at the accumulation layer (the single place that touches the catalog) and emitting ready-to-render items, the bus contract becomes simpler and consumers don't duplicate catalog logic.

### Why not a two-tier consumer taxonomy

The issue proposed separate mechanisms for "system infrastructure" vs "peer blocks." But with the `emits` field and `{workspaceId}.action.performed` event, `ActivityFeedBlock` fits the same `listensTo` pattern as any peer block. Wildcards on the bus close the expressiveness gap. One mechanism is simpler to document, test, and teach than two.

---

## Consequences

### Benefits

- **One subscription pattern.** Block authors learn `listensTo`/`onEvent` — it's the only way. No choosing between declarative and imperative.
- **One action pipeline.** Lifecycle and custom actions flow through the same accumulation → flush → bus path. One place to debug, one failure mode, one dedup strategy.
- **Simpler block props.** `BlockComponentProps` drops from 5 fields to 3. Blocks don't import `WorkspaceBus` or `sendAction`.
- **No lost custom actions.** Custom actions on unsaved entries are accumulated and flushed on first save — same guarantee as lifecycle actions.
- **Simpler ActivityFeedBlock.** `listensTo: ["eln.action.performed"]` replaces registry iteration, per-block subscriptions, suppression gates, and catalog lookup.
- **Cleaner bus namespace.** Only cross-boundary events appear on the bus. Internal renderer signals don't pollute the event namespace.

### Constraints

- **Breaking change to `BlockComponentProps`.** `bus` and `sendAction` are removed. All blocks that access these props must be updated.
- **Breaking change to `ActivityFeedBlock`.** It must migrate from imperative `bus.on()` to `listensTo`/`onEvent`.
- **`BlockLifecyclePayload` removed from public exports.** Any external code referencing lifecycle event payloads must be updated.
- **`eln.actions.flushed` event removed.** Any code listening for this event must migrate to `eln.action.performed`.
- **Renderer must provide typed emitters for `emits`.** Blocks declare `emits`; the renderer must wire bus emission. The exact typed handle mechanism is deferred to #344.

### Future considerations

- **Peer-block communication.** `listensTo`/`onEvent` was designed for this — a Chart block subscribing to `*.data-changed` to refresh. The infrastructure now supports it; the first use case will validate the design.
- **Cross-workspace events.** The bus is currently scoped to one workspace. If actions need to cross workspace boundaries (e.g., a LIMS action appearing in the ELN activity feed of a linked entry), the bus or the API layer may need extending.
- **Action-sourced real-time updates.** With `{workspaceId}.action.performed` carrying resolved action items, a WebSocket bridge could push these to other clients for real-time activity feed updates.
- **`emits` on buttons.** Buttons are fire-only; they already emit via `bus.emit()`. The `emits` declaration pattern could extend to buttons if they need auditable actions in the future.
