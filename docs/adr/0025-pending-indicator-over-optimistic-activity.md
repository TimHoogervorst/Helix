# ADR-0025: Pending Indicator Over Optimistic Activity Rendering

> Date: 2026-08-27
> Status: Accepted
> Companion spec: [SPEC: Generalize the ELN Activity feed into a subject-agnostic Activity block](https://github.com/TimHoogervorst/Helix/issues/582)
> Related: [ADR-0011](0011-declarative-bus-subscriptions.md) (revisits one of its consequences)

---

## Context

The Activity Feed rendered in-flight actions optimistically: the accumulator emitted `{workspaceId}.action.performed` with fully-resolved items after each action POST, and the feed merged those optimistic items with confirmed API rows, deduping by request ID. ADR-0011 introduced exactly this contract — it replaced the old `eln.actions.flushed` refetch signal with per-action resolved items so the feed could render immediately.

Three problems surfaced:

1. **The optimistic machinery is complex for what it buys** — payload accumulation in block attributes, request-ID dedupe, and a pending state that the presentation layer didn't even recognize (the block emitted `"optimistic"`, the component styled `"pending"`).
2. **Optimistic items were wrong in edge cases** — the ELN workspace passes no user into the slot context, so optimistic actors rendered as "Unknown".
3. **A persistence race** — block-action POSTs complete *after* the entry-save event fires, so a refetch on entry save alone misses them; only the optimistic items masked the gap.

Once the feed is generalized to any subject (issue #582) — including surfaces with no Event Bus at all — the optimistic path becomes a special case for one workspace rather than the feed's core behavior.

## Decision

**The Activity Feed renders persisted Action Log Entries only. In-flight changes are represented by a single muted "Unsaved changes…" indicator, and the feed refreshes when the flush completes. The `{workspaceId}.actions.flushed` event returns as that completion signal.**

- The accumulator emits `{workspaceId}.actions.pending` when its pending set transitions empty → non-empty; the feed shows the indicator.
- The accumulator emits `{workspaceId}.actions.flushed` once every action POST in a flush succeeds; the feed clears the indicator and refetches. A failed flush leaves the actions pending and the indicator visible.
- Entry-level saves (which log their own actions server-side, synchronously with the PUT) keep their existing saved event as a refetch trigger.
- `{workspaceId}.action.performed` continues to be emitted — the contract is unchanged — but the feed no longer listens. It currently has no production listener.
- All optimistic machinery is deleted: bus-payload accumulation in block attributes, optimistic items, request-ID dedupe of unpersisted rows, and pending-item styling in the presentation component. Confirmed-batch grouping by request ID is kept.

This revisits a consequence of ADR-0011, which removed `eln.actions.flushed` in favor of per-action resolved items. That decision's rationale — optimistic rendering — is deleted by this one; meanwhile the flush-complete signal is precisely what the persistence race requires.

## Considered Options

| Option | Verdict |
|---|---|
| **Keep optimistic rendering** (status quo) | Complex, wrong actors in edge cases, masks the POST race instead of solving it, and only ever applies to bus-bearing workspaces. |
| **Pending indicator + flush-driven refetch** (chosen) | The feed shows only persisted audit rows; one boolean state; the refetch is accurate because it runs after persistence. |
| **Workspace exposes dirty/pending state via slot context** | No new events, but couples the feed to each workspace's internals — every workspace would recompute the flag its own way — instead of using the bus, the platform's established cross-boundary channel. |

## Consequences

- `{workspaceId}.actions.pending` and `{workspaceId}.actions.flushed` join the public bus vocabulary.
- Feed UX trades immediacy for truth: users see "Unsaved changes…" instead of ghost rows, then the real rows appear after the flush.
- The feed becomes trivially portable to bus-less surfaces (fetch-only, no indicator) — the entity workspace binding needs no live wiring at all.
