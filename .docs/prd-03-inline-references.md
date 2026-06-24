# PRD-03: Inline Reference System

> Status: `ready-for-agent`
> Date: 2026-06-24
> Parent: [PRD-02](prd-02-eln-editor.md)

---

## Problem Statement

Lab notebook entries frequently reference each other (and will eventually reference samples, protocols, and other entities). Currently, users type raw IDs like `#E1` as plain text, which is fragile — there's no link, no visual indication, no title resolution, and broken references go unnoticed. As the number of entries grows, manually tracking which entries reference which others becomes impossible.

## Solution

A live inline reference system. Typing `#` in the ELN editor opens a searchable autocomplete dropdown. Selecting an entry (or typing the full ID and pressing space) converts the raw text into a clickable badge — light blue with a page icon and the referenced entry's title. Clicking the badge navigates to that entry. Broken references render as red badges. The backend syncs a `Mention` table on every save, enabling reverse lookups ("which entries mention E5?").

---

## User Stories

1. As a scientist writing an ELN entry, I want to type `#` followed by an entry ID and see a searchable dropdown of matching entries, so that I can quickly find and reference other entries without leaving the editor.
2. As a scientist, I want the dropdown to not block my typing, so that I can keep writing uninterrupted while the search loads.
3. As a scientist, I want to press Space after typing `#E1` to auto-convert it into a reference badge, so that I can create references without using the mouse.
4. As a scientist, I want to press Tab to select the first dropdown suggestion and insert the reference, so that I can reference entries with minimal keystrokes.
5. As a scientist, I want references to appear as light blue badges with an icon and the target entry's title, so that I can understand what is being referenced at a glance.
6. As a scientist, I want to click a reference badge to navigate to the referenced entry, so that I can quickly jump between related entries.
7. As a scientist, I want to delete a reference badge by pressing Backspace once, so that references feel like atomic units, not text I have to carefully select.
8. As a scientist, I want broken references (entries that have been deleted or never existed) to appear as red badges with a "Reference not found" tooltip, so that I can identify and fix dead links.
9. As a scientist, I want references to resolve to the current title of the target entry on every page load, so that if the target entry is renamed, the badge automatically reflects the new title.
10. As a scientist, I want to see a loading state (`#E1` plain text) briefly while the badge resolves, so that the editor feels responsive even before the API responds.
11. As a scientist, I want references to work in both edit mode and view mode, so that I can click badges whether I'm reading or editing.
12. As a scientist, I want the reference system to eventually support referencing samples (`#S1`), protocols, and other entity types, so that the system grows with the lab's needs.
13. As a lab manager, I want the system to maintain a `Mention` table that tracks which entries reference which others, so that I can query "what links to E5?" in the future.

---

## Implementation Decisions

### 1. Mention table as source of truth for resolution

References are stored in the TipTap JSON as lightweight inline nodes containing only a `displayId` attribute. The `Mention` table is the canonical record of all references. Badge content (title, URL) is resolved live from the API on every page load, not cached in the document. This means title changes propagate automatically.

### 2. Custom TipTap inline node (`reference`)

The reference badge is modeled as an atomic inline node (not a mark). The node schema:

```json
{
  "type": "reference",
  "attrs": {
    "displayId": "E1"
  }
}
```

The node is atom-level — cursor cannot enter it, Backspace deletes the entire badge. Built with `@tiptap/extension-mention` configured to insert a custom node type.

### 3. Autocomplete on `#` with non-blocking dropdown

`@tiptap/suggestion` triggers on the `#` character. On each keystroke after `#`, a debounced (200ms) `GET /api/references/search/?q={query}` fires. The dropdown shows matches with a loading indicator while the request is in flight. The dropdown does not block typing — the user can continue entering text.

### 4. Two insertion paths: Space and Tab

- **Space**: If the typed text matches the `#[A-Z]\d+` pattern, it auto-converts to a reference node on space. This works even without the dropdown.
- **Tab**: Selects the first item in the autocomplete dropdown and inserts the reference node.
- Both paths insert the same node type with the same `displayId` attribute.

### 5. Batch resolution on page load

When the editor loads a document, it scans the TipTap JSON for all `reference` nodes, extracts their `displayId` values, and fires a single `POST /api/references/resolve/` with the list of IDs. The response maps each `displayId` to target details (title, URL, type). The frontend caches this for the session.

### 6. Three badge visual states

| State | Appearance | Behavior |
|-------|-----------|----------|
| **Loading** | `#E1` as plain text | Transitions to resolved on API response |
| **Resolved** | Light blue pill: page icon + monospace `E1` + title | Click navigates to entry |
| **Broken** | Red pill: warning icon + `E1` | Hover shows "Reference not found" tooltip |

### 7. Prefix-based entity routing (`PREFIX_MAP`)

A service-layer mapping resolves `display_id` prefixes to models. Initially only `E` → `NotebookEntry`. Extended with one line per new entity type:

```python
PREFIX_MAP = {
    "E": NotebookEntry,
    # "S": Sample,  # future
}
```

### 8. Mention sync on save

On save (POST/PUT), the serializer calls a `sync_mentions(source_entry, tiptap_json)` service function. It:

1. Walks the TipTap JSON tree, collecting all `displayId` values from `reference` nodes
2. Resolves each `displayId` to a `(ContentType, object_id)` pair via `PREFIX_MAP`
3. Skips unresolvable IDs (broken references — the frontend already shows red)
4. Diffs against existing `Mention` rows for this source entry
5. Creates new mentions, deletes removed ones, leaves unchanged ones alone
6. Runs in a transaction

### 9. Generalize Mention.source_entry → GenericForeignKey

The existing `Mention.source_entry` ForeignKey is generalized to a GenericForeignKey (`source_type` + `source_id`) so that future content-bearing entities (samples with description text, protocols) can also contain mentions.

### 10. Resolution API

`POST /api/references/resolve/` accepts `{ "ids": ["E1", "E2"] }` and returns:

```json
{
  "E1": { "id": 1, "display_id": "E1", "title": "PCR Protocol", "url": "/eln/1", "type": "entry" },
  "E2": null
}
```

`null` for any ID that doesn't resolve — the frontend renders a broken badge.

### 11. Search API

`GET /api/references/search/?q=E1` returns:

```json
{
  "results": [
    { "display_id": "E1", "title": "PCR Protocol", "type": "entry" },
    { "display_id": "E2", "title": "Gel Results", "type": "entry" }
  ]
}
```

Searches by `display_id` prefix match. Future: also search by title substring.

### 12. API URL design

Both endpoints live under `/api/references/` — a dedicated URL namespace, not under `/api/eln/`. This reflects that references span entity types and are not ELN-specific.

### 13. Editor integration

The `ElnEditor` component gains a reference resolution hook that:
- On content load (view mode), extracts `displayId`s from the document
- Batch-resolves them
- Provides a lookup map to the `Reference` node's React node view
- The node view reads from this map to render resolved/broken/loading states

---

## Testing Decisions

### What makes a good test

- Test external behavior: creating/updating an entry with references → Mention rows appear/diff correctly
- Test the resolve and search API endpoints with real Django test client calls
- Do NOT test TipTap internals or React rendering — those are covered by manual verification and are too brittle for unit tests

### Seams and modules

1. **Service seam** (`sync_mentions()`) — highest value. Test with known TipTap JSON inputs, verify Mention rows created/updated/deleted correctly. Test that unresolvable displayIds are silently skipped.
2. **API seam** — test `POST /api/references/resolve/` with valid IDs, invalid IDs, and mixed. Test `GET /api/references/search/?q=` with matches and no matches.
3. **Serializer seam** — test that saving an entry via the existing entry endpoint triggers `sync_mentions()` and the Mention table is correct afterward.

### Prior art

Follow the existing test patterns in `backend/eln/tests/test_api.py` — Django `APITestCase`, direct model assertions, JSON content in request bodies.

---

## Out of Scope

- **Bidirectional "mentioned by" display** — the Mention table supports the query, but no UI for "this entry is referenced by X, Y, Z" yet
- **Title substring search in autocomplete** — search is `display_id` prefix only; title search comes later
- **Mentions from non-ELN entities** — only NotebookEntry contains reference nodes; Samples and other types gain this when they get rich-text content
- **Mention notifications** — no alert when an entry you authored gets mentioned
- **Rich hover cards** — no hover preview of the referenced entry; click navigates directly
- **Image/link references** — `#` references only; no `@` user mentions or `!` image embeds
- **Reference count/index** — no "cited by N entries" counter on entries

---

## Further Notes

- The `@tiptap/extension-mention` package provides the node primitives; `@tiptap/suggestion` provides the dropdown. Both are from the official TipTap project and are well-maintained.
- The `PREFIX_MAP` pattern is intentionally simple — when we exceed ~5 entity types, we can revisit with a registry pattern, but YAGNI applies.
- Reference nodes inside code blocks or other non-editable contexts should be excluded from parsing during mention sync.
