# Deduplicate Activity Feed Entries on Block Edit

> **Originating issue:** [#248](https://github.com/TimHoogervorst/OpenScience/issues/248)
> **Status:** Ready for implementation
> **Labels:** `ready-for-agent`

---

## Problem Statement

When a user edits inside a block (e.g., checking off a protocol step), **two** entries appear in the activity feed instead of one:

1. `admin Protocol 'Seeding of Cells' edited` — block-level action with a human-readable message
2. `admin Edited` — entry-level action with no message, falling back to a mechanical verb

This happens because two independent action-logging mechanisms fire on every save: the server-side `ActionLoggingMixin` on `NotebookEntryViewSet` logs `eln.entry.edited` for every `PUT`/`PATCH`, and the frontend `useBlockActionLogging` flushes block-level actions (e.g., `eln.protocol-block.edited`) via a batch `POST`. Both rows appear in the activity feed, creating noise and confusion.

The entry-level `eln.entry.edited` action carries no human-readable message (only version metadata), so the shared `Activity` component falls back to the mechanical label `"Edited"`. The block-level action carries a descriptive message like `"Protocol 'Seeding of Cells' edited"`. Users see a redundant, information-poor row alongside the meaningful one.

---

## Solution

**Suppress the server-side `eln.entry.edited` action when block-level actions exist for the same save cycle.** The frontend signals the server via an `X-Block-Actions` request header on the `PUT`/`PATCH`. The server checks for this header in `perform_update` and skips `_maybe_log` when it is present.

Block-level actions are the canonical audit record for content changes. The entry-level `eln.entry.edited` is only needed when no block actions fired — plain-text paragraph edits, title-only changes, status-only changes, folder moves, or direct API calls.

### Design rule

> If any block action exists in the current save cycle, `eln.entry.edited` is suppressed. Otherwise, it is logged as usual.

This is a simple binary rule — no distinction between content-only and metadata changes. The `ContentVersion` table already provides immutable document history for CFR Part 11 compliance, independently of the action log.

---

## User Stories

1. As a scientist checking off protocol steps, I want to see only the meaningful block action ("Protocol 'Seeding of Cells' edited") in the activity feed, so that I'm not distracted by redundant entry-level entries.

2. As a scientist editing a plain-text paragraph in my notebook entry, I want to still see an "Edited" action in the feed, so that my text changes are recorded even though no block was involved.

3. As a scientist changing an entry's title, I want the title change recorded in the activity feed, so that the audit trail captures metadata changes.

4. As a scientist changing an entry's status from "In Progress" to "Finished", I want the status change recorded, so that the entry lifecycle is auditable.

5. As a scientist attaching or detaching tags, I want tag operations recorded with their dedicated action types (`eln.entry.tags_attached`, `eln.entry.tag_detached`), so that tag changes are distinct and searchable.

6. As an auditor reviewing CFR Part 11 records, I want the `ContentVersion` table to provide a complete, immutable history of every document state, so that I can reconstruct what the document looked like at any point in time even when the entry-level action was suppressed.

7. As a developer using the API directly (not through the frontend), I want `eln.entry.edited` actions still logged for my `PUT`/`PATCH` requests, so that the audit trail works without the frontend's block-level logging.

8. As a user editing multiple blocks and changing the title in a single save, I want the block actions to appear in the feed and the entry-level edit suppressed, so that the block actions are the primary record and the title change is captured in the `ContentVersion` history.

---

## Implementation Decisions

### 1. Frontend signals intent; server decides

The frontend `useBlockActionLogging` hook knows whether block actions are pending. It exposes this state via a `MutableRefObject<boolean>` that the caller (`ElnWorkspace`) creates and passes to both the hook and the save mechanism. The save mechanism reads the ref at flush time and sets the `X-Block-Actions: 1` header on the `PUT`/`PATCH` request.

The server checks for this header in `perform_update`. Header present → skip `_maybe_log`. Header absent → log as usual.

**Rationale:** The server cannot infer whether block actions will follow from the request body alone (plain-text edits also change `content`). The frontend is the only component that knows whether block lifecycle events have fired during the current editing session. The server still holds the final decision — it only suppresses when explicitly told to.

### 2. `useBlockActionLogging` accepts an optional `hasPendingRef` parameter

The hook signature changes from:

```
useBlockActionLogging(bus, entryId, blockIds): void
```

to:

```
useBlockActionLogging(bus, entryId, blockIds, hasPendingRef?): void
```

The hook writes `true` to `hasPendingRef.current` when `pendingRef.current.size > 0`, and `false` when the map is empty. Updates happen synchronously whenever the accumulation map changes (on lifecycle event or after flush).

### 3. `ElnEditorHandle.save()` accepts an optional options parameter

The handle interface changes from:

```typescript
save: () => void;
```

to:

```typescript
save: (options?: { hasBlockActions?: boolean }) => void;
```

The change is additive — existing callers that omit the argument continue to work. `ElnWorkspace` passes `hasBlockActionsRef.current` when calling `save()`.

### 4. The flag flows through the save chain as a parameter

`ElnEditor.save()` → `useEntryCrud.save/autoSave(hasBlockActions)` → `useSaveQueue.enqueue(payload, saveMode, hasBlockActions)`. Each layer adds a parameter and forwards it. These are plumbing changes — no decisions at these layers. `useSaveQueue` stores `hasBlockActions` on the `QueuedSave` item and `drain()` sets the header when true.

### 5. Server checks `X-Block-Actions` header in `perform_update`

At the end of `perform_update`, the `_maybe_log` call is guarded:

```python
if not self.request.headers.get("X-Block-Actions"):
    self._maybe_log(self.action, instance=instance, validated_data=validated_data)
```

Header present → block actions will cover this save → skip the entry-level action. Header absent → log as usual (covers plain-text edits, metadata-only changes, and direct API calls).

### 6. Action type behaviors (unchanged)

| Action Type | Trigger | Affected by this change? |
|---|---|---|
| `eln.entry.created` | POST create entry | No |
| `eln.entry.edited` | PUT/PATCH update entry | **Yes — suppressed when `X-Block-Actions` header present** |
| `eln.entry.deleted` | DELETE entry | No |
| `eln.entry.tags_attached` | POST attach tags | No |
| `eln.entry.tag_detached` | DELETE detach tag | No |
| `eln.{block}.{verb}` | Block lifecycle events via batch POST | No (these are the canonical actions) |

### 7. CFR Part 11 compliance path

The `ContentVersion` table provides immutable document history independently of the action log. Every content-changing save creates a `ContentVersion` row with a SHA-256 content hash, version number, timestamp, and the creating user. The action log records *who did what when*; ContentVersions record *what the document looked like*. An auditor can reconstruct the complete document state timeline by querying `ContentVersion` ordered by `version_number`, regardless of which action rows exist.

---

## Testing Decisions

### What makes a good test

Tests should verify external behavior — the presence or absence of action rows after a save — not the internal mechanism (header values, ref updates). Use the highest seam possible: the HTTP API response and the action log query result.

### Test cases

**Frontend (`useBlockActionLogging`):**
- When pending map goes from empty to non-empty, `hasPendingRef.current` becomes `true`
- When pending map is cleared (flush), `hasPendingRef.current` becomes `false`
- When no lifecycle events fire, `hasPendingRef.current` stays `false`
- During programmatic content loads (suppression gate), ref is not updated

**Server (`NotebookEntryViewSet.perform_update`):**
- `PUT` with `X-Block-Actions: 1` and content change → no `eln.entry.edited` created
- `PUT` without header and content change → `eln.entry.edited` created
- `PUT` without header and title-only change → `eln.entry.edited` created
- `PUT` with `X-Block-Actions: 1` and title+content change → no `eln.entry.edited` created (binary rule)
- `PATCH` with `X-Block-Actions: 1` → same suppression behavior as `PUT`

**Integration:**
- Block edit → save → activity feed shows only the block action, not `eln.entry.edited`
- Plain-text edit → save → activity feed shows `eln.entry.edited`
- Direct API `PUT` (no header) → `eln.entry.edited` logged

### Prior art

- Server-side action logging tests: `src/server/core/tests/test_actions_mixins.py` — tests `ActionLoggingMixin` behavior via DRF test client
- Frontend hook tests: `src/mods/eln/__tests__/useBlockActionLogging.test.ts` — tests accumulation, flush, and suppression behavior
- Integration: `src/mods/eln/__tests__/ElnWorkspacePage.test.tsx` — tests the full workspace including activity feed

---

## Out of Scope

- **Activity feed grouping** — displaying multiple block actions from the same save as a single grouped entry ("User made several edits"). This is a follow-up UI enhancement.
- **Changing action type naming conventions** — block actions continue to use `eln.{blockId}.{verb}` naming.
- **Adding action logging for `delete_all`** — the bulk-delete endpoint remains unlogged (development/danger-zone tool).
- **Adding action logging for lock operations** — lock acquire/release/renew remain unlogged.
- **Removing `eln.entry.edited` entirely from `action_log_config`** — it must remain for direct API use and metadata-only changes.

---

## Further Notes

- The `NotebookEntryViewSet.perform_update()` already overrides the mixin's `perform_update` completely (no `super()` call). The `_maybe_log` at the end of the method is the *only* place `eln.entry.edited` is created for updates. This means a single-line guard is sufficient — no need to modify the mixin.
- The hash-based no-op short-circuit in `perform_update` (lines 139-159) is unchanged. If nothing changed at all, no action is logged regardless of headers.
- The `ContentVersion` hash-based no-op already prevents duplicate `ContentVersion` rows. This spec only addresses duplicate *action log* rows.
- The `X-Block-Actions` header is intentionally absent from direct API calls, preserving the existing behavior for API consumers. No migration or deprecation needed.
