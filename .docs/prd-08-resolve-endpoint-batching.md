# PRD-08: Resolve Endpoint — Batching & Cache Fix

> Status: `ready-for-agent`
> Date: 2026-06-26
> Parent: [PRD-07](prd-07-unified-reference-badges.md)

---

## Problem Statement

On a single LIMS page load with **17 entities**, the browser fires **~673 POST requests** to `/api/references/resolve/` in rapid succession — each containing exactly one display ID (e.g. `{"ids":["E12"]}`). The endpoint supports batch resolution (accepts an array of IDs), but this capability is never used. The same IDs are re-resolved hundreds of times before the page stabilizes.

The root cause is a three-part bug in `ReferenceProvider` and `ReferenceBadge`:

1. **No batching** — each badge calls `resolveIds([displayId])` individually with a single ID.
2. **Stale closure** — all effects within the same React render flush see the same `resolutionMap` snapshot; pending markers set by sibling badges are invisible.
3. **State overwrite** — `setResolutionMap(value)` (value setter, not functional updater) causes React to keep only the **last** call's state, clobbering all other pending markers. This triggers a cascade of re-renders where each render only captures one pending ID, causing the next render to re-fire requests for the remaining IDs → **O(N²) API calls**.

The `resolutionMap` *is* already a cache (keyed by `displayId`), but the stale-closure bug prevents it from working correctly.

## Observed Behavior (Playwright)

```
#61  POST /api/references/resolve/  {"ids":["E13"]}  → {"E13":null}
#62  POST /api/references/resolve/  {"ids":["E12"]}  → {"E12":null}
#63  POST /api/references/resolve/  {"ids":["E13"]}  → {"E13":null}
...
#200 POST /api/references/resolve/  {"ids":["E12"]}  → {"E12":null}
...
#400 POST /api/references/resolve/  {"ids":["E13"]}  → {"E13":null}
...
#733 POST /api/references/resolve/  {"ids":["E13"]}  → {"E13":null}
```

Same 4 unique IDs (E9, E11, E12, E13) resolved hundreds of times each. None exist in the database (null responses), but the cascade is identical for resolvable IDs.

---

## Solution

### Fix 1: Functional State Updater (makes the cache work)

**File:** `frontend/src/components/ReferenceProvider.tsx`

The `setResolutionMap(value)` call must become `setResolutionMap(prev => ...)` — a **functional updater** — so that multiple pending markers accumulate correctly instead of overwriting each other.

**Before (broken):**
```tsx
const pending = new Map(resolutionMap);  // stale snapshot
for (const id of unseen) {
  pending.set(id, undefined);
}
setResolutionMap(pending);               // overwrites other in-flight updates
```

**After (fixed):**
```tsx
setResolutionMap(prev => {
  const next = new Map(prev);
  for (const id of unseen) {
    next.set(id, undefined);             // pending marker
  }
  return next;
});
```

This ensures that when 12 badges call `resolveIds` within the same render flush, **all 12** pending markers are accumulated into the map — not just the last one. The cache now correctly prevents duplicate network requests for the same ID.

**Why this is a cache:** The `resolutionMap` is a `Map<displayId, ResolvedRef | null>`. Once an ID is resolved (or marked broken/null), every badge displaying that ID reads from the same map entry. No hash is needed — the `displayId` string IS the cache key.

### Fix 2: Microtask Batch Queue (reduces N calls → 1 call)

**File:** `frontend/src/components/ReferenceProvider.tsx`

Instead of firing an API call immediately inside `resolveIds`, collect IDs into a queue and flush them all at once on the next microtask tick. The endpoint already accepts `{"ids": ["E1", "E2", ...]}` — we just need to use it.

```tsx
// Conceptual sketch — not final code
let batchQueue: string[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatch() {
  const ids = [...new Set(batchQueue)];  // deduplicate
  batchQueue = [];
  batchTimer = null;
  // Single POST with all collected IDs
  post("/references/resolve/", { ids }).then(/* update map */);
}

function resolveIds(ids: string[]) {
  const unseen = ids.filter(id => !resolutionMap.has(id));
  if (unseen.length === 0) return;

  // Mark pending via functional updater (Fix 1)
  setResolutionMap(prev => { ... });

  // Queue for batched flush
  batchQueue.push(...unseen);
  if (!batchTimer) {
    batchTimer = setTimeout(flushBatch, 0);  // next microtask
  }
}
```

**Result:** 12 badges requesting resolution in the same render → 1 batched POST with all 12 IDs → 12 map entries updated from one response.

### Fix 3: Stabilize `resolveIds` Reference

**File:** `frontend/src/components/ReferenceBadge.tsx`

The `useEffect` in `ReferenceBadge` includes `resolveIds` in its dependency array. Since `resolveIds` is recreated every time `resolutionMap` changes (via `useCallback`), every state update triggers **all** badge effects to re-fire.

**Fix:** Remove `resolveIds` from the dependency array, or use a `useRef` to hold a stable reference:

```tsx
// Option A: useRef for resolveIds (stable reference)
const resolveIdsRef = useRef(resolveIds);
resolveIdsRef.current = resolveIds;

useEffect(() => {
  if (clickable && resolved === undefined) {
    resolveIdsRef.current([displayId]);
  }
}, [clickable, resolved, displayId]);  // resolveIds removed
```

This way a badge only requests resolution on mount and when its `displayId` changes — not every time an unrelated badge resolves.

---

## How the Cache Works After Fix

Once Fix 1 and Fix 2 are applied, the `resolutionMap` serves as a proper cache:

```
                    ┌──────────────────────────────────┐
                    │       ReferenceProvider           │
                    │                                  │
                    │  resolutionMap: Map<              │
                    │    "E12"  → {id:12, title:"..." } │
                    │    "E13"  → null (broken)         │
                    │    "S1"   → {id:7,  title:"..." } │
                    │  >                                │
                    └──────┬───────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ReferenceBadge   ReferenceBadge    ReferenceBadge
    displayId="E12"  displayId="E12"   displayId="E13"
    clickable        clickable=false   clickable

All three badges read from the SAME resolutionMap.
"E12" resolves once → both badges showing "E12" use the cached result.
No duplicate network calls.
```

**Cache lifecycle:**
- **Cache miss:** `displayId` not in map → queued for batch resolve
- **Pending:** `displayId` → `undefined` (marker set via functional updater) → badges show loading state
- **Resolved:** `displayId` → `ResolvedRef` object → all badges show icon + title
- **Broken:** `displayId` → `null` → all badges show red broken state
- **Cache lives:** for the lifetime of the `ReferenceProvider` (page session)

No TTL, no eviction — the map is scoped to a page session and is small (tens to low hundreds of entries). A full page navigation unmounts `ReferenceProvider` and creates a fresh cache.

---

## Implementation Decisions

### 1. Microtask timer, not requestAnimationFrame

Using `setTimeout(fn, 0)` batches all synchronous `resolveIds` calls from a single React render flush. `requestAnimationFrame` would add unnecessary latency (~16ms). The microtask approach fires the batched POST before the next paint.

### 2. Deduplication at flush time

```tsx
const uniqueIds = [...new Set(batchQueue)];
```

Multiple badges may request the same ID (e.g. 4 entities referencing E12). Deduping ensures the batch contains each ID once.

### 3. Skip already-resolved IDs at flush time too

Between when an ID is queued and when the batch flushes, a previous batch response may have already resolved it. Check `resolutionMap` again at flush time:

```tsx
function flushBatch() {
  const ids = [...new Set(batchQueue)].filter(id => !resolutionMap.has(id));
  batchQueue = [];
  batchTimer = null;
  if (ids.length === 0) return;
  // ... POST
}
```

### 4. Error handling preserves partial results

If the batched POST fails, remove pending markers for the batch's IDs so they can be retried on the next interaction (same behavior as today's per-ID error handling, but batch-wide).

### 5. `resolveIds` reference stability

Use a `useRef` inside `ReferenceBadge` to hold the latest `resolveIds` without triggering effect re-runs. The effect dependencies become `[clickable, resolved, displayId]` only.

### 6. Backend unchanged

The `POST /api/references/resolve/` endpoint already accepts `{"ids": ["E1", "BLOOD5", ...]}` and returns a map. No backend changes needed — we're just finally using the batch capability.

---

## User Stories

1. As a scientist, I want the LIMS page to load quickly without hundreds of unnecessary network requests, so that I can browse my entities without lag.
2. As a developer, I want `ReferenceBadge` components to share resolution state via a cache, so that resolving a display ID once serves all badges showing that same ID.
3. As a developer, I want the batch-resolve endpoint to be used as designed, so that 50 badges produce 1 network call, not 50.

---

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/components/ReferenceProvider.tsx` | Fix 1: functional state updater for `setResolutionMap`. Fix 2: microtask batch queue + single POST flush. |
| `frontend/src/components/ReferenceBadge.tsx` | Fix 3: stabilize `resolveIds` via `useRef`, remove from `useEffect` deps. |

All other files are unaffected — the public API of `ReferenceProvider` (`resolutionMap`, `resolveIds`) and `ReferenceBadge` (props) does not change.

---

## Files NOT Changed

| File | Reason |
|------|--------|
| `backend/references/views.py` | Already supports `{"ids": [...]}` batch input |
| `backend/references/services.py` | Already resolves each ID independently; no change needed |
| `frontend/src/api/client.ts` | `post()` function is already generic and works as-is |
| All badge consumers (ElnList, LimsList, LimsDetailCard, ElnEditor, LimsTableNode, ReferenceNode, ReferenceBadgeCellRenderer) | No API change — they still call `resolveIds([displayId])` the same way |

---

## Testing Decisions

### What makes a good test

- Unit test `ReferenceProvider`: verify that calling `resolveIds` with 10 IDs produces exactly 1 `POST` call with all 10 IDs in the body.
- Unit test `ReferenceProvider`: verify that calling `resolveIds` with the same ID twice (before flush) only includes it once in the batch.
- Unit test `ReferenceProvider`: verify that IDs already in `resolutionMap` (resolved or broken) are skipped.
- Unit test `ReferenceBadge`: verify that the effect only fires on mount and `displayId` change, not on `resolutionMap` changes.
- Integration test: render a page with multiple badges, verify only one `POST /api/references/resolve/` is made.

### Seams and modules

1. **ReferenceProvider flush seam** — mock `post()` and assert the shape and count of calls.
2. **ReferenceBadge effect seam** — render with mock context, change unrelated state, assert `resolveIds` is not called again.
3. **Dedup seam** — call `resolveIds(["E1"])` and `resolveIds(["E1"])` in same tick, assert only one network call with `["E1"]`.

---

## Domain Model Update

This PRD does not introduce new domain terms. It fixes the resolution infrastructure so that:

```
ReferenceProvider (context)
├── resolutionMap: Map<displayId, ResolvedRef | null>  ← THE CACHE
│   ├── cache miss  → queued for batch resolve
│   ├── pending     → undefined (loading state for badges)
│   ├── resolved    → ResolvedRef (icon + title shown)
│   └── broken      → null (red pill shown)
├── resolveIds(ids) → marks pending + queues for batch
└── batchQueue      → flushed on next microtask as single POST
```

---

## Out of Scope

- **Persistent cache across page navigations** — cache is per-page-session. Full SPA navigation unmounts `ReferenceProvider` and creates a fresh cache.
- **Cache TTL / staleness** — no time-based eviction. A reference that resolves successfully is assumed valid for the page session.
- **Prefetching** — no speculative resolution of IDs before they're rendered.
- **Server-side caching headers** — the browser's standard HTTP cache handles backend response caching via `Cache-Control` headers (future optimization).
- **WebSocket / real-time invalidation** — if an entry is renamed, badges won't update until page reload. This is acceptable for v1.
