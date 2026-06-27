# PRD-11: Content Sync Deepening — Unified Tree-Walker and Pipeline Interface

**Status:** `ready-for-agent`
**Date:** 2026-06-27

## Problem Statement

When a NotebookEntry is saved, its TipTap/ProseMirror JSON content must be scanned for two kinds of embedded data:

1. **limsTable nodes** — table widgets backed by an EntityType schema. Each row corresponds to an Entity record. On save, the backend must create/update/delete Entity rows and patch entity IDs back into the JSON so the frontend can display them as ReferenceBadges.

2. **reference nodes** — inline `@`-mention links to other NotebookEntries or Entities. On save, the backend must create/update/delete Mention rows (GenericForeignKey links) so the reference graph stays current.

These are implemented as two independent recursive JSON tree walkers in separate service modules, called in sequence from two places in the view layer:

```
eln/views.py
    perform_create()          perform_update()
    ┌─────────────────┐      ┌─────────────────┐
    │ sync_entities()  │      │ sync_entities()  │
    │ sync_mentions()  │      │ sync_mentions()  │
    │ if changed: save │      │ if changed: save │
    └─────────────────┘      └─────────────────┘
            │                        │
    ┌───────┴────────┐    ┌──────────┴────────┐
    │ lims/services  │    │ references/svc    │
    │ _walk_lims_    │    │ walk_reference_   │
    │   tables()     │    │   nodes()         │
    └────────────────┘    └───────────────────┘
```

Three problems:

1. **Duplicated traversal logic.** `_walk_lims_tables` (lims/services.py) and `walk_reference_nodes` (references/services.py) are independent recursive tree walkers. Both implement the same traversal — recursing into `content[]` arrays, nested dicts, and nested lists — but look for different node types. Adding a third node type (e.g., a Protocol widget) requires writing a third walker. ADR-0004 unified the frontend browser components; the backend content sync layer is the next seam to unify.

2. **Ordering knowledge lives at every call site.** Entities must sync before mentions because newly created entity display IDs may be referenced in table cells. This ordering is enforced only by a comment in `perform_create` and `perform_update`. Both methods duplicate the same 6-line sequence:
   ```python
   content = sync_entities(instance, instance.content)
   sync_mentions(instance, content)
   if content != instance.content:
       instance.content = content
       instance.save(update_fields=["content"])
   ```
   A third sync step (e.g., `sync_protocols`) would need to be inserted at the right position in two places by a developer who knows the ordering constraint. The module is shallow — the interface (two calls + conditional save + ordering comment) is nearly as complex as the implementation.

3. **No test for the pipeline itself.** The existing tests (`lims/tests/test_services.py`, `references/tests/test_services.py`) test each sync function in isolation. No test verifies the ordering constraint or the full content-diff-and-save sequence. If someone swaps the two calls in `perform_update`, no test fails.

## Solution

Two atomic commits that turn a shallow two-call surface into a deep one-call interface:

### Slice 2: Unify the TipTap Tree-Walker

Extract a single `walk_tiptap_tree(root, handler)` function in `backend/core/walker.py`. The walker handles all traversal; each caller supplies a handler invoked for every node. The handler returns a modified dict (replace the node) or `None` (no change).

**Interface — `walk_tiptap_tree`:**

```python
# backend/core/walker.py

def walk_tiptap_tree(root: dict, handler: Callable[[dict], dict | None]) -> dict:
    """
    Walk a TipTap/ProseMirror JSON tree depth-first.

    *handler* is called for every dict node in the tree.  It may return:

    * A ``dict`` — the node is replaced with the returned dict.
    * ``None`` — the node is left unchanged.

    The walker recurses into:
    * ``content`` arrays (TipTap child nodes)
    * Nested dict values (e.g., ``attrs``)
    * Arbitrary lists of dicts (e.g., ``attrs.rows``)

    Non-dict list items (strings, numbers) are passed through unchanged.

    Returns a (possibly identical) copy of *root*.  The input tree is
    never mutated — handlers that return ``None`` get back the original
    node.  Multi-pass patterns (collect, then patch) are supported:
    call ``walk_tiptap_tree`` once per pass.
    """
```

**What changes:**

| File | Change |
|------|--------|
| `backend/core/walker.py` | **NEW** — shared walker, its only public export |
| `backend/core/tests/test_walker.py` | **NEW** — traversal tests |
| `backend/lims/services.py` | `_walk_lims_tables` becomes a thin wrapper calling `walk_tiptap_tree` |
| `backend/references/services.py` | `walk_reference_nodes` becomes a thin wrapper calling `walk_tiptap_tree` |

The domain logic stays in each service module — the walker knows nothing about `limsTable` nodes, `reference` nodes, or any ProseMirror node type. It only knows the structure of the TipTap JSON tree.

**Before (each service has its own recursive function):**

```
lims/services.py              references/services.py
┌──────────────────┐         ┌──────────────────────┐
│ _walk_lims_tables │         │ walk_reference_nodes  │
│  ├─ isinstance?   │         │  ├─ isinstance?       │
│  ├─ type==lims?   │         │  ├─ type==reference?  │
│  ├─ content[]↓    │         │  ├─ type==limsTable?  │
│  ├─ nested dict↓  │         │  ├─ content[]↓        │
│  └─ nested list↓  │         │  ├─ nested dict↓      │
└──────────────────┘         │  └─ nested list↓      │
                             └──────────────────────┘
```

**After (shared traversal, per-module domain logic):**

```
core/walker.py
┌──────────────────────┐
│ walk_tiptap_tree     │  ← single recursive traversal
│  ├─ isinstance?      │
│  ├─ handler(node)    │  ← caller-supplied
│  ├─ content[]↓       │
│  ├─ nested dict↓     │
│  └─ nested list↓     │
└──────┬───────────────┘
       │ used by
  ┌────┴────────────────────────────┐
  │                                 │
lims/services.py              references/services.py
┌──────────────────┐         ┌──────────────────────┐
│ handler: collect  │         │ handler: discover    │
│ limsTable nodes,  │         │ reference nodes +    │
│ group by schema   │         │ limsTable Ref cols   │
│                   │         │ → accumulate IDs     │
│ handler: patch    │         └──────────────────────┘
│ entityIds into    │
│ attrs.rows        │
└──────────────────┘
```

**Design decisions from grilling:**

1. **Handler returns `dict | None` only.** The PRD-architecture-deepening draft proposed a third case ("falsy non-None → delete node from parent"). Removed — no current caller needs it, and one adapter doesn't justify a seam. When a real caller needs deletion, add it then.

2. **Always returns a copy.** The walker never mutates the input tree. This supports the multi-pass pattern in `sync_entities` (collect pass → DB reconcile → patch pass), where each pass produces a fresh tree for the next pass to consume.

3. **Generator use case via closure.** `walk_reference_nodes` is currently a generator yielding display_id strings. Under the unified walker, it becomes a handler that accumulates into an external list. The slight awkwardness is worth the locality gain — all traversal lives in one place.

4. **Non-dict children preserved.** TipTap content arrays can contain strings (text inside a mark). The walker passes these through without calling the handler on them (it only fires on dict nodes).

### Slice 3: Deepen the Content Sync Pipeline

Extract a single `sync_entry_content(entry)` function in `backend/eln/sync.py`. This function owns the ordering, the conditional save, and the full sync pipeline. The callers (`perform_create`, `perform_update`) each drop from 6 lines of sync orchestration to 1 call.

**Interface — `sync_entry_content`:**

```python
# backend/eln/sync.py

def sync_entry_content(entry: NotebookEntry) -> NotebookEntry:
    """
    Sync all derived content for *entry*.

    Pipeline (ordering matters):
    1. ``sync_entities`` — walks TipTap JSON for limsTable nodes, creates/
       updates/deletes Entity rows, patches entity IDs into attrs.rows.
    2. ``sync_mentions`` — walks the (possibly patched) JSON for reference
       nodes, creates/deletes Mention rows.

    Entities sync first because newly created entity display IDs may be
    referenced from other parts of the same document (via reference nodes
    in table cells or inline text).

    Saves the entry if content changed (entity IDs patched in). Returns
    the (possibly updated) entry.
    """
```

**What changes:**

| File | Change |
|------|--------|
| `backend/eln/sync.py` | **NEW** — `sync_entry_content`, its sole public export |
| `backend/eln/tests/test_sync.py` | **NEW** — pipeline tests (ordering, no-op, full flow) |
| `backend/eln/views.py` | `perform_create` and `perform_update` each drop from ~6 lines to 1 call |

**Before (views.py — both methods duplicate the same sequence):**

```python
def perform_create(self, serializer):
    author = self.request.user if self.request.user.is_authenticated else None
    instance = serializer.save(author=author)
    # Sync entities first (patches entityIds into content),
    # then sync mentions (may find new reference nodes in table cells)
    content = sync_entities(instance, instance.content)
    sync_mentions(instance, content)
    if content != instance.content:
        instance.content = content
        instance.save(update_fields=["content"])

def perform_update(self, serializer):
    instance = serializer.save()
    content = sync_entities(instance, instance.content)
    sync_mentions(instance, content)
    if content != instance.content:
        instance.content = content
        instance.save(update_fields=["content"])
```

**After:**

```python
def perform_create(self, serializer):
    author = self.request.user if self.request.user.is_authenticated else None
    instance = serializer.save(author=author)
    sync_entry_content(instance)

def perform_update(self, serializer):
    instance = serializer.save()
    sync_entry_content(instance)
```

The ordering knowledge moves from the caller (a comment anyone can miss) into the implementation (enforced by the call order inside `sync_entry_content`). The conditional save moves from two call sites into one.

**Why save inside `sync_entry_content`:**

The function already does DB writes (creating entities, creating/deleting mentions). Adding one more `.save()` doesn't change its nature — it was never pure. The alternative (return content, let the caller save) keeps the caller interface larger for no benefit.

**Failure atomicity:** If `sync_entities` succeeds but `sync_mentions` raises, the exception propagates and Django's transaction rolls back. Same behavior as today — no regression in failure handling.

## Domain Glossary References

This PRD uses canonical terminology from:
- [CONTEXT.md](../CONTEXT.md) — Entry, Entity, Mention, ReferenceBadge, limsTable
- [docs/adr/0001-tiptap-json-content-format.md](../docs/adr/0001-tiptap-json-content-format.md) — TipTap/ProseMirror JSON document structure
- [docs/adr/0002-display-id-prefix-routing.md](../docs/adr/0002-display-id-prefix-routing.md) — Display ID system, prefix→model resolution

## User Stories

### Slice 2: Unified Tree-Walker

1. As a developer, I want a single `walk_tiptap_tree` function that handles all TipTap JSON traversal, so that adding a third sync step (e.g., Protocol widgets) doesn't require writing a third recursive tree walker.

2. As a developer, I want the walker to live in `backend/core/walker.py` with no imports from `lims`, `eln`, or `references`, so that it has zero circular-import risk and is trivially testable in isolation.

3. As a developer, I want the walker to support both transformation (replace nodes) and discovery (collect findings), so that both existing use cases (`sync_entities`'s collect+patch passes and `sync_mentions`'s reference discovery) can use the same traversal code.

4. As a developer, I want the walker to never mutate its input, so that multi-pass patterns (collect → DB reconcile → patch) work correctly without defensive deep-copying by the caller.

5. As a developer, I want `_walk_lims_tables` and `walk_reference_nodes` to delegate to the shared walker, so that I verify behavior parity by ensuring existing tests pass unchanged.

6. As a developer, I want the shared walker tested independently (flat docs, nested docs, handler replacement, handler no-change, content arrays, nested dicts, arbitrary lists, deeply nested structures), so that traversal bugs are caught once, not once per caller.

### Slice 3: Deepened Sync Pipeline

7. As a developer, I want a single `sync_entry_content(entry)` function that owns the entity→mention ordering, so that I don't need to remember "entities first, then mentions" and I can't accidentally swap them.

8. As a developer, I want `perform_create` and `perform_update` to each call `sync_entry_content(instance)` instead of a 6-line manual sequence, so that adding a third sync step (e.g., Protocol widgets) changes one file (`eln/sync.py`), not three (views.py + two call sites).

9. As a developer, I want the pipeline tested explicitly — an entry with both limsTable nodes and reference nodes verifies entities sync before mentions, a removed limsTable verifies entities are deleted, and a no-op entry verifies no unnecessary saves — so that the ordering constraint is verified in CI.

10. As a developer, I want the existing `sync_entities` and `sync_mentions` tests to continue passing unchanged, so that the refactoring is verifiably behavior-preserving.

### Regression Prevention

11. As a developer, I want `python manage.py test core eln lims references` to pass after each slice, so that each commit is independently deployable.

12. As a developer, I want the existing API tests (`eln/tests/test_api.py`) to pass without modification after `perform_create` and `perform_update` are refactored, so that the API surface is unchanged.

## Implementation Decisions

### Decision 1: Two Slices, Two Commits

Slice 2 (unified walker) and Slice 3 (deepened pipeline) are separate commits. Slice 2 is mechanical extraction — move code, delegate, verify tests pass. Slice 3 is interface deepening — the shape of the module changes. Separating them means:

- If Slice 3's interface is wrong, Slice 2 doesn't need to be reverted.
- Slice 2 can be reviewed as "does the walker correctly unify both traversal patterns?"
- Slice 3 can be reviewed as "is this the right interface for the sync pipeline?"

### Decision 2: Walker Location — `backend/core/walker.py`

The walker lives in `core/` because it's a pure utility with no domain knowledge. It imports nothing from `lims`, `eln`, or `references`. This avoids circular imports (the bane of Django app structure) and signals that the walker is a general-purpose tool for any code that processes TipTap JSON.

**Not** `backend/core/services.py` — the existing `lims/services.py` and `references/services.py` naming is a legacy convention. New modules use descriptive names (`walker.py`, `sync.py`).

**Not** a shared `backend/shared/` app — Django doesn't need an app for a utility module. `core/` is the established location for cross-cutting code (already holds `abstracts.py` for `BrowsableItem`).

### Decision 3: Handler Signature

```python
handler: Callable[[dict], dict | None]
```

Two possible return values, no third option:
- Return a `dict` → the walker replaces the node with this dict
- Return `None` → the node is unchanged

The handler is called for **every** dict node — not just nodes matching a type filter. This is deliberate: each handler decides what it cares about. A handler that only cares about `limsTable` nodes checks `node.get("type") == "limsTable"` as its first line. This keeps the walker simple and the domain logic colocated with the handler.

**Rejected alternative: predicate + handler pair.** `walk_tiptap_tree(root, predicate, handler)` where predicate filters nodes before calling handler. Rejected because:
- It forces every caller to define two functions instead of one
- The handler already needs to check node type to do its work — the predicate just duplicates that check
- Composes poorly: what if a handler cares about multiple node types?

**Rejected alternative: `None` → delete node from parent.** The architecture-deepening PRD draft included this. Removed after grilling — no current caller needs it, and "one adapter = hypothetical seam, two = real."

### Decision 4: Multi-Pass Support

`sync_entities` walks the tree twice (collect, then patch). The unified walker supports this by always returning a (possibly identical) copy:

```python
# sync_entities internals after unification
tree = entry.content

# Pass 1: collect limsTable nodes, group by schema
tables_by_schema = {}
def collect(node):
    if node.get("type") == "limsTable":
        # ... accumulate into tables_by_schema ...
    return None  # no transformation

tree = walk_tiptap_tree(tree, collect)

# ... DB reconcile (not a walk) ...

# Pass 2: patch entity IDs back into rows
def patch(node):
    if node.get("type") == "limsTable":
        # ... patch entityId/displayId into attrs.rows ...
        return new_node
    return None

tree = walk_tiptap_tree(tree, patch)
return tree
```

Each pass receives the output of the previous pass. The walker never mutates the tree passed to it.

### Decision 5: Generator Use Case via Accumulator

`walk_reference_nodes` is currently a generator that yields display_id strings. Under the unified walker:

```python
# sync_mentions internals after unification
found_ids = []

def discover(node):
    if node.get("type") == "reference":
        display_id = node.get("attrs", {}).get("displayId")
        if display_id:
            found_ids.append(display_id)
        return None  # reference nodes are atomic, no transformation

    if node.get("type") == "limsTable":
        # Scan Reference-type columns in attrs.rows
        # ... append display_id strings to found_ids ...
    return None

walk_tiptap_tree(tiptap_json, discover)

# Then resolve found_ids as before
for display_id in found_ids:
    result = resolve_display_id(display_id)
    ...
```

The handler mutates an external list — a side effect. This is the acknowledged trade-off for unified traversal. The payoff: the traversal logic (recursing into content[], nested dicts, nested lists) lives in one place. If it's ever buggy (e.g., skipping a nesting level), it's fixed once.

### Decision 6: `sync_entry_content` Saves the Entry

The function signature is:

```python
def sync_entry_content(entry: NotebookEntry) -> NotebookEntry:
```

It saves internally if content changed. Rationale:
- The function already does DB writes (Entity CRUD, Mention CRUD)
- Adding one more `.save(update_fields=["content"])` is consistent
- The caller's interface shrinks to one call with no return-value check
- If a future caller needs content without saving, that's a different function

The returned `NotebookEntry` is the same instance, possibly with `content` updated in-memory. Callers that need the fresh instance can use the return value; callers that don't care can discard it.

### Decision 7: File Structure After Implementation

```
backend/
├── core/
│   ├── abstracts.py              ← unchanged (BrowsableItem)
│   ├── walker.py                 ← NEW: walk_tiptap_tree
│   └── tests/
│       ├── test_abstracts.py     ← unchanged
│       └── test_walker.py        ← NEW
├── lims/
│   ├── services.py               ← REFACTORED: _walk_lims_tables → walk_tiptap_tree
│   └── tests/
│       └── test_services.py      ← unchanged (tests call sync_entities, not _walk_lims_tables)
├── references/
│   ├── services.py               ← REFACTORED: walk_reference_nodes → walk_tiptap_tree
│   └── tests/
│       └── test_services.py      ← unchanged (tests call sync_mentions, not walk_reference_nodes)
└── eln/
    ├── sync.py                   ← NEW: sync_entry_content
    ├── views.py                  ← REFACTORED: perform_create/update use sync_entry_content
    └── tests/
        ├── test_api.py           ← unchanged (API-level tests)
        └── test_sync.py          ← NEW
```

No existing test file is modified. This is the deletion test in action — the complexity removed from `views.py` reappears concentrated in `eln/sync.py`, with its own test suite.

### Decision 8: No Functional Changes

This PRD is a **pure refactoring** — the user-visible behavior is identical:
- Entry create and update produce the same Entity rows, Mention rows, and patched JSON content
- API responses are unchanged (same status codes, same response bodies)
- The frontend sees no difference — entity IDs in limsTable rows are still patched; reference badges still resolve

## Testing Decisions

### What Makes a Good Test

- **For the walker**: test traversal mechanics — does it reach every node in every nesting pattern? Tests use synthetic TipTap JSON, not database-backed entries.
- **For the pipeline**: test the ordering — given content with both limsTable and reference nodes, are entities created before mentions? Tests use real DB entries because `sync_entities` and `sync_mentions` require the database.
- **For existing tests**: they must pass without modification. This verifies behavior parity.

### Seams

**Primary seam: `walk_tiptap_tree(root, handler)`.** Test it in isolation with synthetic trees:

```
test_walker.py
├── test_walks_flat_document          ← doc → paragraph → text
├── test_walks_nested_document        ← paragraphs inside a doc
├── test_handler_replaces_node        ← handler returns modified dict
├── test_handler_returns_none         ← handler returns None → unchanged
├── test_walks_content_arrays         ← content[] with multiple children
├── test_walks_nested_dicts           ← attrs with nested objects
├── test_walks_arbitrary_lists        ← attrs.rows (not named "content")
├── test_deeply_nested_structure      ← heading inside list inside doc
├── test_non_dict_items_preserved     ← strings and numbers in lists pass through
├── test_does_not_mutate_input        ← original tree unchanged after walk
└── test_multi_pass_pattern           ← two sequential walks, second sees first's changes
```

**Primary seam: `sync_entry_content(entry)`.** Test it with real DB instances:

```
test_sync.py
├── class SyncEntryContentTests
│   ├── test_noop_empty_entry              ← entry with no limsTable or refs → no changes
│   ├── test_syncs_entities_from_table     ← limsTable creates Entity rows
│   ├── test_syncs_mentions_from_refs      ← reference nodes create Mention rows
│   ├── test_entities_before_mentions      ← both present → entities created first
│   ├── test_removed_table_deletes_entities ← limsTable gone → Entity deleted
│   ├── test_removed_refs_delete_mentions   ← reference gone → Mention deleted
│   ├── test_unresolvable_refs_skipped      ← reference to nonexistent → skipped
│   ├── test_content_patched_on_save        ← entity IDs written back to JSON
│   └── test_no_unnecessary_save            ← unchanged content → no save() call
```

**Integration seams:** Existing test suites pass without modification:

- `backend/lims/tests/test_services.py` — all `SyncEntitiesTests` pass (they call `sync_entities`, which still works)
- `backend/references/tests/test_services.py` — all `SyncMentionsTests` pass (they call `sync_mentions`, which still works)
- `backend/eln/tests/test_api.py` — all API tests pass (`perform_create`/`perform_update` now call `sync_entry_content`)

### Prior Art

- Walker test patterns: the existing `backend/lims/tests/test_services.py` builds synthetic TipTap JSON docs (via `make_lims_table_doc`) and asserts on the resulting Entity state. The walker tests use the same synthetic doc pattern but test traversal, not entity creation.
- Pipeline test patterns: the `test_sync_reference_cells_create_mentions` test in `lims/tests/test_services.py` already tests the combined entity+mention flow by calling both functions sequentially. The new `test_sync.py` tests formalize this as a single-call pattern.
- Backend test conventions: `django.test.TestCase`, `setUp` for fixtures, descriptive test method names.

## Out of Scope

- **Third sync step (Protocol, Plate, etc.).** No new sync type is added. The deepened pipeline makes adding one trivial — a single new call inside `sync_entry_content` — but that's a separate feature.

- **Async or background processing.** Content sync remains synchronous in the request/response cycle. Moving sync to a background task is a separate architectural decision.

- **Frontend changes.** No frontend code is touched. The API surface is unchanged.

- **Merging `lims/services.py` and `references/services.py`.** Each service module keeps its domain logic. Only the traversal is shared.

- **Generic sync dispatch.** No plugin registry for sync steps. `sync_entry_content` calls `sync_entities` then `sync_mentions` explicitly. A generic `SYNC_STEPS = [...]` registry is the right design for when a third step exists — not before. One adapter per step, not a hypothetical registry for two.

- **Content diff optimization.** The `if content != instance.content` check compares full JSON dicts. A more efficient diff (e.g., comparing only entity IDs) is out of scope.

- **Transaction boundaries.** The existing code relies on Django's default transaction behavior (autocommit + atomic per-request via `ATOMIC_REQUESTS`). No change to transaction handling.

## Further Notes

- This PRD is the output of a grilling session on Slices 2+3 of the [Architecture Deepening PRD](../docs/prd-architecture-deepening.md). The grilling examined: the unified walker interface, handler semantics, multi-pass support, generator-vs-transformer patterns, `sync_entry_content`'s save behavior, failure atomicity, and test survival. Key design decisions are recorded in the Implementation Decisions section above.

- The grilling removed one feature from the original PRD draft: the "handler returns falsy non-None → delete node" behavior. It was speculative — no current caller uses it — and added complexity to the interface contract for a hypothetical future caller.

- The `backend/eln/sync.py` module is named `sync.py` (not `services.py`) because it exports exactly one function. If the module grows multiple sync-related functions, renaming to `services.py` is a trivial refactor. Starting small.

- `walk_tiptap_tree` is tested with synthetic ProseMirror JSON trees — no database, no Django test case needed (though Django's `TestCase` is fine for convenience). The tests verify traversal correctness independent of domain logic.

- The existing `test_sync_reference_cells_create_mentions` in `lims/tests/test_services.py` imports both `sync_entities` and `sync_mentions` and calls them sequentially. This test is the closest existing analog to the new `sync_entry_content` test suite and confirms that the combined flow is already tested at the integration level.

- The `_walk_lims_tables` and `walk_reference_nodes` functions can remain as module-private helpers that delegate to `walk_tiptap_tree`, or they can be inlined into their callers. The refactoring keeps them as thin wrappers initially (reducing the diff), and a follow-up cleanup can inline them if they become one-liners.

- The `_get_dynamic_prefix_map` function in `references/services.py` has a bare `except Exception` that swallows errors during migration. This is existing behavior and is not changed by this PRD. A separate hardening pass should replace it with a specific exception type (e.g., `ProgrammingError`, `OperationalError`).

---
