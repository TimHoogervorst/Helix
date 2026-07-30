# ADR-0009: System-Derived Global IDs and Typed Handles

> Date: 2026-07-30
> Status: Proposed
> Supersedes: N/A — new design replacing hand-constructed registration IDs

---

## Context

Registration IDs are hand-constructed, repeated across multiple call sites, and easy to get wrong. The same fully-qualified dotted string appears in 5+ places per registration. The `-block` suffix is redundant (`registerBlock` already says it's a block). The `eln.` prefix is redundant inside `src/mods/eln/index.ts`. camelCase/kebab-case inconsistency (`registryTable` vs `registry-table`) is easy to miss.

Issue: [#344](https://github.com/TimHoogervorst/Helix/issues/344)

---

## Decision

**Every registration ID is system-derived from the mod manifest identity + a local name. The `Mod` class is the public API for all registration. Hand-constructed dotted strings are eliminated.**

### 1. ModManifest.json

```json
{
  "vendor": "helix",
  "name": "eln",
  "displayName": "Electronic Lab Notebook",
  "version": "0.1.0",
  "dependsOn": ["helix.lims", "helix.tags"]
}
```

- `vendor` + `name` = uniqueness anchor (`"helix.eln"`)
- `dependsOn` entries are always fully qualified `vendor.name`
- Identity only — no capability declarations

### 2. The `Mod` class

Public API for registration. Each mod creates one at module scope from its own manifest:

```typescript
import manifest from "./modManifest.json";
const mod = new Mod(manifest);

export const editorSlot = mod.declareSlot({ name: "editor", accepts: "block", ... });
export const tableBlock = mod.registerBlock({ name: "table", ... });
mod.registerIntoSlot(editorSlot, tableBlock);
```

- Derives all global IDs: `mod.name + "." + localName` → `"eln.table"`
- Returns typed handles (`SlotHandle`, `BlockHandle`, `ButtonHandle`)
- Handles carry: `globalId`, `modId`, and type brand
- Cross-mod lookup: `mod.resolveSlot("helix.eln", "editor")` — runtime, `dependsOn` guarantees ordering
- Ships in SDK for external mods

### 3. BlockEvent class

The single contract for declaration, binding, and runtime emission:

```typescript
class BlockEvent {
  id: string;                                    // "entities-registered"
  category: "action" | "ui";                     // standardizes payload + routing
  core: "created" | "edited" | "deleted" | "ui"; // audit classification
  tags: string[];                                // reserved, future PR

  static action(config: { id: string; core: "created" | "edited" | "deleted" }) {
    return new BlockEvent({ ...config, category: "action", tags: [] });
  }
  static ui(config: { id: string }) {
    return new BlockEvent({ ...config, category: "ui", core: "ui", tags: [] });
  }
}
```

Registration:
```typescript
mod.registerBlock({
  name: "registry-table",
  emits: [
    BlockEvent.action({ id: "entities-registered", core: "edited" }),
    BlockEvent.action({ id: "row-added", core: "edited" }),
    BlockEvent.ui({ id: "column-resized" }),
  ],
});
// Returns BlockHandle with typed emitters: blockHandle.emits.entitiesRegistered, etc.
```

Runtime in block component:
```typescript
emits.entitiesRegistered.fire({ count: 5 });
// → Bus receives:
{
  blockEventId: "eln.registry-table.entities-registered",
  category: "action",
  core: "edited",
  tags: [],
  payload: { count: 5 },
  timestamp: 1712345678000,
}
```

The `BlockEvent` class is the entire contract — declaration at registration, binding to typed emitters, emission on the bus. One class, one shape, everywhere.

### 4. Lifecycle actions are baked-in

Every editor-slot-bound block automatically gets `created`, `edited`, `deleted` — no `emits` declaration needed. The renderer constructs `BlockEvent` instances internally:

```typescript
BlockEvent.action({ id: "created", core: "created" })
BlockEvent.action({ id: "edited", core: "edited" })
BlockEvent.action({ id: "deleted", core: "deleted" })
```

Same `BlockEvent` shape on the bus. The block never sees them.

### 5. Action catalog sync

Frontend sends `POST /api/mod-registry/sync-actions/` at boot with all block `emits` entries. Backend upserts the catalog using the shared derivation rule (`mod.name + "." + blockName + "." + eventId`). No hand-written action catalog in `mod.py`. Boot validation hard-fails on mismatches.

### 6. Bus events use `BlockEvent` as the payload shape

- Accumulator reads `category: "action"` → routes to flush → `POST /api/actions/`
- ActivityFeed reads `category: "action"` → renders in feed
- `category: "ui"` events stay on the bus, never hit the database
- `label` is a backend concern — resolved from the catalog at render time
- `tags` is reserved for future listen-by-tag (`bus.onTag("audit", handler)`)

### 7. ID naming rules

- kebab-case for all local names
- Drop `-block` suffix everywhere
- Drop mod prefix from local names (system derives it)
- Derived global IDs: `"eln.table"`, `"eln.registry-table"`, `"eln.linked-entities"`

### 8. Cross-mod references

```typescript
// Runtime lookup — canonical path, works for internal and external mods
const editorSlot = mod.resolveSlot("helix.eln", "editor");
mod.registerIntoSlot(editorSlot, myBlock);
```

`dependsOn` guarantees load ordering. Static imports available for same-repo convenience but runtime lookup is the endorsed path — it scales to external mods without change.

### 9. Migration

All at once. No legacy path. Full rename table:

| Before | After |
|--------|-------|
| `eln.table-block` | `eln.table` |
| `eln.comment-block` | `eln.comment` |
| `eln.registryTable-block` | `eln.registry-table` |
| `eln.protocol-block` | `eln.protocol` |
| `eln.metadata-block` | `eln.metadata` |
| `eln.linked-entities-block` | `eln.linked-entities` |
| `eln.attachments-block` | `eln.attachments` |
| `eln.activity-feed` | `eln.activity-feed` |
| `entities.selection-block` | `lims.selection` |
| `entities.my-views-block` | `lims.my-views` |
| `entities.global-views-block` | `lims.global-views` |

### 10. ModRegistry

Becomes internal infrastructure. `Mod` delegates storage to it internally. Mods never import `ModRegistry` directly. Standalone `registerBlock()`, `declareSlot()` etc. are removed from the public API.

### 11. Boot sequence

```
ModLoader globs modManifest.json → topological sort by dependsOn
  → Import index.ts in order (module-scope registrations fire)
  → Call register() for lazy-loaded routes/settings sections
  → POST /api/mod-registry/sync-actions/ → backend hydrates action catalog
  → Boot validation: frontend action IDs checked against catalog → hard-fail on mismatch
  → App renders
```

---

## Rationale

### Why a `Mod` class instead of ambient registration

An explicit `Mod` instance carries the manifest identity (vendor, name) and derives global IDs. It is testable (pass a mock manifest), reusable (SDK for external mods), and prevents the footgun of calling `registerBlock()` outside a mod context. VS Code uses the same pattern: each extension gets a scoped `vscode` namespace created from its `package.json`.

### Why `vendor.name` instead of UUID

Human-debuggable. Core mods all share vendor `"helix"` — no collision. External mods use their own vendor name (`"acme.eln"` vs `"helix.eln"`). UUIDs add no value until there are thousands of mods from unknown authors — easily added later as an optional field.

### Why runtime lookup for cross-mod references

Static imports couple mods at the module graph level and don't work for external mods (whose types aren't available at build time). Runtime lookup (`mod.resolveSlot("helix.eln", "editor")`) works identically for internal and external mods. `dependsOn` guarantees load ordering. The VS Code extension API uses the same pattern (`extensions.getExtension('publisher.name')?.exports`).

### Why the backend is the source of truth for actions

Per [ADR-0008](./0008-single-source-registration.md), the backend owns anything with a database row. Action catalog entries are persisted and auditable — the backend owns them. The frontend declares what it intends to emit via `BlockEvent.emits`; the backend validates and stores. The `blockEventId` is the contract key between frontend and backend.

### Why lifecycle actions are baked-in

Every editor-slot-bound block needs `created`, `edited`, `deleted`. Requiring developers to declare them in `emits` is boilerplate. The renderer auto-generates them. This matches the principle that the system should derive what it can — the developer only declares what's unique to their block.

### Why `BlockEvent` is a single class

Declaration and emission share the same shape. The class owns id, category, core, tags, and the fire method. This eliminates the gap between "what I declared at registration" and "what flows on the bus" — they are the same object. Listeners, accumulators, and the ActivityFeed all receive the same shape.

---

## Consequences

### Benefits

- **No hand-constructed IDs.** Every global ID is derived from the manifest + a local name. Typos are structurally impossible.
- **Single source of truth.** Block actions are declared once (`emits`), synced to the backend at boot, validated on mismatch.
- **Compile-time safety.** Typed handles catch slot/block mismatches at registration. Typed emitters (`blockHandle.emits.entitiesRegistered`) catch action ID typos at the call site.
- **Same contract for external mods.** The `Mod` class, `BlockEvent`, and runtime lookup API are the SDK surface. External mods use the same API as core mods.
- **Cleaner IDs.** No `-block` suffix. No redundant `eln.` prefix. Consistent kebab-case. The Activity Feed shows "Table" not "Table-block".

### Constraints

- **Boot sequence depends on backend.** The `POST /api/mod-registry/sync-actions/` endpoint must be available before the frontend completes boot. This is already the case in the Docker startup flow.
- **Cross-mod coupling is runtime, not compile-time.** `mod.resolveSlot("helix.eln", "editor")` returns `SlotHandle | undefined` — callers must null-check. This is the same trade-off VS Code made.
- **Migration is all-at-once.** ~15 files change in one PR. No legacy path, no dual-path transition window.

### Future considerations

- **External mod SDK.** The `Mod` class and `BlockEvent` are the foundation. External mods get them via `import { Mod, BlockEvent } from "@helix/sdk"`.
- **`tags` on `BlockEvent`.** Reserved for listen-by-tag: `bus.onTag("audit", handler)`.
- **Backend auto-generation of lifecycle entries.** Currently the backend catalog must still list `created|edited|deleted` for each block. A future improvement: the backend auto-generates lifecycle entries for every block it receives in the sync payload.
- **Non-block action sources.** `mod.py` `register_action_model()` still exists for backend-originated actions (e.g., `"eln.entry.created"` from Django model operations). Block-originated actions flow through `emits` → sync-actions.
