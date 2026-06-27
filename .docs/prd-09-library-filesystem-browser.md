# PRD-09: Library — Unified Filesystem-Like Browser for Folders and Entries

**Status:** `ready-for-agent`
**Date:** 2026-06-26

## Problem Statement

The current ELN list page (`/eln`) shows a flat, paginated list of all notebook entries with no folder awareness. Users must navigate to a separate page to create entries, and there is no way to browse the folder hierarchy visually. As the system grows to include more content types (PDFs, spreadsheets, protocols), a flat entry list becomes unusable.

The user needs a browsable, folder-aware Library where they can navigate the folder tree, see both folders and entries at any level, preview entry contents without leaving the list, and open entries in a full editor — all within a single, consistent interface that matches the LIMS entity browser they already know.

## Solution

Introduce the **Library** — a unified, filesystem-like browsing surface at `/library`. The Library presents the folder hierarchy as a browsable tree: at any path, users see a single mixed table of folders and entries, sorted folders-first. Navigation happens through clickable breadcrumbs at the top and by clicking into folders in the table.

The Library reuses the **three-step fold state machine** from LIMS (`list` → `detail` → `expanded`):

- **List**: Mixed table of folders + entries at the current path. Folders have a folder icon; entries have a document icon and display ID badge. Clicking a folder navigates into it. Clicking an entry opens the detail card.
- **Detail**: Two-panel — mixed table on the left, entry summary card on the right. The card shows the entry's ID badge, title, type (placeholder), created date, author, parent folder, and a scrollable content preview rendered from the entry's TipTap JSON (prose only, no references or tables).
- **Expanded**: Three-panel — collapsed strip on the left, detail card in the middle, and the full ElnEditor embedded in the right panel. The `[<]` button collapses back to detail; the `[x]` button returns to the list at the current folder path.

A `+` dropdown button in the header creates either a new Folder or a new ELN Entry in the current path. New entries have their folder pre-set to the current path, with an override option.

The existing `/eln`, `/eln/new`, and `/eln/:id` routes remain functional as direct-entry points. The Library is the new browsing surface; ELN is the editor/viewer for individual entries.

## Domain Glossary References

This PRD uses the canonical terminology from [CONTEXT.md](../CONTEXT.md). Key terms:

- **Library** — the organizational container and browsing surface for the folder hierarchy
- **Folder** — a node in the folder tree; a container for entries and child folders
- **ELN Entry (NotebookEntry)** — a single page of narrative lab documentation with rich-text content
- **Rich-Text Document** — the TipTap JSON content inside an entry

Architecture decisions are recorded in:
- [.docs/architecture.md](architecture.md) — decision #20
- [docs/adr/0003-library-filesystem-browsing.md](../docs/adr/0003-library-filesystem-browsing.md) — full rationale for the mixed-table pattern

## User Stories

1. As a lab researcher, I want to open the Library and see the contents of the root folder (both sub-folders and entries), so that I can start browsing my work from a familiar filesystem-like view.

2. As a lab researcher, I want to see folders listed before entries in the Library table, so that I can find the folder I need before scrolling through individual entries.

3. As a lab researcher, I want to click on a folder row to navigate into that folder, so that I can drill down through my organizational structure.

4. As a lab researcher, I want a clickable breadcrumb bar at the top showing my current path (e.g., `/ Experiments / Q1-2026 /`), so that I can see where I am and jump to any parent folder.

5. As a lab researcher, I want a back/up button alongside the breadcrumbs, so that I can quickly navigate to the parent folder without reading the path.

6. As a lab researcher, I want folders and entries to be visually distinct in the table (folder icon vs. document icon), so that I can tell at a glance what is a container and what is content.

7. As a lab researcher, I want to see columns for ID, Name, Type, Created, and Folder for each row, so that the Library table is consistent with the LIMS entity table I already know.

8. As a lab researcher, I want folders to show blank metadata (`—`) for columns they don't have (ID, Type, Created), so that the table structure is consistent and I'm not confused by missing columns.

9. As a lab researcher, I want the Type column to be present as a placeholder (`—`) even though entries don't have types yet, so that the column is there when types are added later.

10. As a lab researcher, I want to click on an entry row to see a summary detail card appear on the right, so that I can preview entry metadata without leaving the Library list.

11. As a lab researcher, I want the detail card to show the entry's display ID badge, title, type, created date, author, and parent folder, so that I can verify the entry's metadata at a glance.

12. As a lab researcher, I want the detail card to show a scrollable preview of the entry's content (headings, paragraphs, bold/italic, lists), so that I can get a sense of what the entry contains without opening the full editor.

13. As a lab researcher, I want the content preview to load lazily with a loading indicator when the detail card opens, so that the Library list stays fast and the preview doesn't block navigation.

14. As a lab researcher, I want the content preview to show only prose formatting (headings, paragraphs, bold, italic, lists) and not render reference badges or tables, so that the preview is clean and readable in a small space.

15. As a lab researcher, I want a `>` button on each entry row (visible on hover), so that I can jump directly to the full editor in three-panel expanded view.

16. As a lab researcher, I want a `>` button on the detail card header when in two-panel view, so that I can expand to the full three-panel editor view.

17. As a lab researcher, I want the full ElnEditor to appear in the right panel when I'm in three-panel expanded view, so that I can read and edit the entry without leaving the Library.

18. As a lab researcher, I want a `<` button on the detail card header when in three-panel expanded view, so that I can collapse the editor back to the two-panel summary view.

19. As a lab researcher, I want an `x` button on the detail card header in any state, so that I can close all detail panels and return to the Library list at my current folder path.

20. As a lab researcher, I want the left panel to collapse into a narrow strip with a `>` button when in three-panel view, so that the editor has maximum screen space.

21. As a lab researcher, I want to click the `>` on the collapsed strip to return to two-panel detail view, so that I can re-expand the Library list and select a different entry.

22. As a lab researcher, I want smooth CSS transitions when panels expand, collapse, slide in, and slide out, so that the spatial relationship between the Library list, detail card, and editor is clear.

23. As a lab researcher, I want a `+` dropdown button in the Library header (replacing the current `+ New Entry` button), so that I can create either a new Folder or a new ELN Entry from one control.

24. As a lab researcher, I want the "New ELN Entry" option in the `+` dropdown to open the editor with the folder pre-set to my current path, so that I don't have to re-select the folder I'm already browsing.

25. As a lab researcher, I want to be able to override the pre-set folder when creating an entry from the Library, so that I can file the entry elsewhere if needed.

26. As a lab researcher, I want the "New Folder" option in the `+` dropdown to show an inline prompt for the folder name, so that I can quickly create a folder in my current path.

27. As a lab researcher, I want a search bar that filters the current folder's contents by name or display ID, so that I can find items in large folders.

28. As a lab researcher, I want the Library URL to reflect my current path (e.g., `/library?path=/Experiments/Q1`), so that I can bookmark and share links to specific folders.

29. As a lab researcher, I want the existing `/eln/:id` direct-entry route to still work, so that cross-references and bookmarks to individual entries remain functional.

30. As a future developer, I want the Library's mixed table to support additional content types (PDFs, spreadsheets, etc.) by adding new type discriminators, so that the Library can grow beyond ELN entries without a redesign.

31. As a future developer, I want the three-step fold state machine to be the same pattern as LimsList.tsx, so that I can maintain both views with a shared mental model.

## Implementation Decisions

### Terminology

1. **"Library" is the canonical term** for the folder-based organizational container and its browsing interface. "ELN" refers specifically to the entry editor. "Notebook" is a deprecated synonym. See [CONTEXT.md](../CONTEXT.md) — Library term.

2. **"Folder" (not "Source" or "Path") is the column name** for the parent-folder column in the table. It shows the immediate parent folder name, not the full path (the breadcrumb already shows the full path).

### Data Model

3. **Existing models are reused without migration changes.** The `core.Folder` model (id, name, parent FK, created_at) and `eln.NotebookEntry` model (id, display_id, title, content JSON, folder FK, author FK, created_at, updated_at) already support the Library's needs. No schema changes required.

4. **Root is a folder.** The root level (`/`) is where items with no parent folder live. Users can place both folders and entries at root. This is the familiar filesystem model.

### API Design

5. **Single unified endpoint: `GET /api/library/contents/?path=/folder/subfolder`.** Returns a paginated, mixed list of items at the given path. Each item has a `type` discriminator (`"folder"` or `"entry"`). Sorted folders-first (alphabetical by name), then entries (newest first by `created_at`). One request — no client-side merging needed.

6. **Entry detail for content preview** uses the existing `GET /api/eln/entries/{display_id}/` endpoint. The detail card lazy-loads the full entry (with content JSON) when opened. A loading indicator bridges the fetch gap.

7. **New Folder creation** uses the existing `POST /api/core/folders/` endpoint. The folder's parent is set from the current Library path.

### URL Design

8. **`/library?path=` query parameter** for folder navigation. Matches the existing LIMS pattern (`/lims?entity=BLOOD1&search=...`). Avoids route conflicts with `/eln/:id`. Example: `/library?path=/Experiments/Q1`.

9. **Existing routes preserved.** `/eln` (entry list), `/eln/new` (create), `/eln/:id` (view/edit) remain functional as direct-entry points. The Library is added alongside them, not replacing them yet.

### UI: Three-Step Fold

10. **Same `ViewState` state machine as LIMS.** The Library page (`LibraryView`) owns a `viewState: "list" | "detail" | "expanded"` state, plus `selectedEntry` and `exiting` animation state. Transitions and exit animations match `LimsList.tsx` exactly.

11. **Mixed table in list state.** Both folders and entries appear in one table. Folder rows: folder icon in Name column, `—` in ID/Type/Created columns, `>` navigates into the folder. Entry rows: document icon, ReferenceBadge in ID, title in Name, created date, parent folder name, `>` opens expanded view.

12. **ReferenceBadge for entry IDs.** Entries use the existing `ReferenceBadge` component for their display ID column. Badges are non-clickable in the table (consistency with LIMS). Folders show no badge.

13. **Detail card content preview.** When the detail card opens for an entry, the full entry is fetched. The preview renders the TipTap JSON content in a read-only TipTap editor with a reduced extension set: only prose formatting (headings, paragraphs, bold, italic, lists). Reference nodes and limsTable nodes are disabled — they don't make sense in a compact preview. The preview container has `max-height` with `overflow-y: auto` for scrollability.

14. **Full ElnEditor embedded in expanded right panel.** The existing `ElnEditor` component is rendered in the right panel when `viewState === "expanded"`. It reuses the same component; no separate "embedded" variant needed. The editor's own title and folder controls may need to be hidden or de-emphasized in embedded mode (the detail card already shows them).

15. **Breadcrumb + back button in the Library header.** Clickable path segments separated by `/`. The current folder is bold and non-clickable. An up-navigation button sits alongside the breadcrumbs. Each segment click updates `?path=` and reloads the table.

### Entry Creation

16. **"+ New" dropdown.** The existing `+ New Entry` button becomes a split dropdown with two options: "New Folder" (inline name prompt, creates folder in current path) and "New ELN Entry" (navigates to editor with folder pre-set).

17. **Folder pre-set with override.** When creating an entry from the Library, the folder selector in `ElnEditor` is pre-populated with the current Library path's folder. The user can change it. Passed via query parameter or component prop.

### Sorting

18. **Folders first (alphabetical by name), then entries (newest first by `created_at`).** This is applied server-side by the single API endpoint. Matches file manager behavior.

### What's Not Changing

19. **No folder display IDs.** Folders are identified by name + path. The ID column shows `—` for folders. Folder display IDs may be added in a future feature.

20. **No entry moving.** Entries are assigned to a folder at creation and stay there. Moving between folders is deferred.

21. **No folder rename or delete in this PRD.** The UI for renaming (inline double-click) and deleting (hover trash icon) folders is deferred to a future feature.

22. **No type filter in the search bar.** Search filters by name/ID only. The type dropdown from LIMS is absent — there's only one entry type for now.

## Testing Decisions

### What makes a good test

Tests for the Library should verify **external behavior** at the API contract level:

- **Backend**: Test the HTTP response shape and sort order of `GET /api/library/contents/`. Do not test internal query construction or ORM details — those are implementation details. Verify that the response includes the correct `type` discriminator, that folders appear before entries, and that pagination works.

- **Frontend**: Test the `ViewState` state machine transitions (list → detail → expanded → detail → list). Test that clicking a folder row navigates vs. clicking an entry row opens the detail card. Test the breadcrumb rendering for various paths.

### Seam: API endpoint

The highest seam is `GET /api/library/contents/?path=...`. This is the single integration point between backend and frontend. Tests should focus on:

- **Root listing**: `GET /api/library/contents/` returns folders at root + entries at root, sorted folders-first
- **Nested folder**: `GET /api/library/contents/?path=/Experiments` returns only items inside `/Experiments`
- **Empty folder**: Returns an empty list (not an error)
- **Nonexistent path**: Returns 404 or empty list (design decision needed)
- **Pagination**: Offset/cursor pagination works for mixed lists
- **Type discriminator**: Every item has `type: "folder"` or `type: "entry"`

Prior art: `backend/eln/tests/test_api.py` — tests the NotebookEntry API with similar pagination and field-shape assertions.

### Seam: Frontend state machine

The `ViewState` transitions reuse the exact pattern from `LimsList.tsx`. Testing this seam means verifying:

- Initial state is `"list"` with no selection
- Clicking an entry row transitions to `"detail"` with `selectedEntry` set
- Clicking `>` on a row transitions to `"expanded"`
- Clicking `<` in expanded transitions to `"detail"` (with exit animation delay)
- Clicking `x` in any state transitions to `"list"` with selection cleared
- Clicking a folder row navigates (updates path) without changing `viewState`

Prior art: The LIMS three-panel layout in `LimsList.tsx` already implements these transitions. The Library page duplicates this pattern — testing can mirror whatever tests exist for LIMS state transitions.

## Out of Scope

- **Entry types / schemas for ELN entries.** The Type column is a placeholder. Designing entry types is a separate feature.
- **Non-ELN content types** (PDFs, spreadsheets, images, protocols). The Library is designed to accommodate them, but they are not implemented here.
- **Folder rename** (inline double-click on name).
- **Folder delete** (hover trash icon with confirmation).
- **Moving entries between folders** (drag-and-drop or "Move to..." action).
- **Bulk operations** (select multiple items to move, delete, or export).
- **Global search across all folders** (search bar filters within the current folder only).
- **Folder metadata** (display IDs, creation dates, permissions display for folders).
- **Replacing `/eln` routes.** The existing routes remain; migration to `/library` happens after the Library feature is complete and stable.
- **Permission enforcement on Library browsing.** Permissions are deferred to a future phase.

## Further Notes

- This PRD is the output of a [grilling session](../skills/grilling/SKILL.md) with 19 design decisions. All decisions trace back to specific questions and answers recorded in that session.
- The domain glossary in [CONTEXT.md](../CONTEXT.md) was updated with the Library term, the Folder definition was sharpened, and a Library vs. Folder distinction was added.
- [ADR-0003](../docs/adr/0003-library-filesystem-browsing.md) documents the full rationale for the mixed-table filesystem-like pattern, including the rejected alternative (tree sidebar + content pane).
- [.docs/architecture.md](architecture.md) decision #20 links to ADR-0003 for traceability.
- The ElnEditor component should be reviewed in the implementation phase: embedding it in a constrained-width right panel may require a prop like `embedded?: boolean` to hide or de-emphasize the title and folder controls (which the detail card already shows).
- The exit animation CSS (`slide-out-right`, `is-exiting` class, 250ms timeout) should be extracted or shared between LimsList and LibraryView to avoid duplication. Consider a shared hook or CSS module.
- Folder creation via the `+` dropdown needs an inline prompt mechanism. A simple `<input>` that appears in the header on "New Folder" click, with Enter to save and Escape to cancel, is sufficient.
