# ADR-0003: Library as Unified Filesystem-Like Browser

> Date: 2026-06-26
> Status: Accepted

---

## Context

The system organizes work in a Folder hierarchy (Folders contain Entries, Entities, and child Folders). Users need to browse this hierarchy to find, open, and organize their work. The existing ELN list page (`/eln`) shows a flat, paginated list of all entries — no folder awareness, no navigation.

The Library replaces this with a browsable, folder-aware interface. Two primary approaches were considered:

| Approach | Folder-aware | Navigation model | Reuses LIMS patterns | Entry preview |
|----------|-------------|------------------|---------------------|---------------|
| **Tree sidebar + content pane** | Yes | Expandable tree on left, contents on right | No — entirely different component tree | Separate detail route |
| **Mixed-table with path breadcrumbs** (chosen) | Yes | Click folder → enter it, click breadcrumb → jump up | Yes — same three-step fold | Inline detail card |

---

## Decision

**Present the folder hierarchy as a unified, filesystem-like table where folders and entries appear together in one list, sorted folders-first.**

The Library page (`/library?path=/folder/subfolder`) shows:

- **A breadcrumb path bar** at the top — clickable segments (`/ Experiments / Q1 /`) with an up-navigation button. The current folder is bold.
- **A unified table** of both folders and entries at the current path:
  - Folder rows: folder icon, name, blank metadata columns (ID, Type, Created), `>` navigates *into* the folder
  - Entry rows: document icon, display ID badge, title, `>` opens the three-step fold (detail card → expanded editor)
- **A `+` dropdown button** that creates either a new Folder or a new ELN Entry in the current path
- **A search bar** filtering by name/ID within the current folder

The entry interaction follows the **same three-step fold state machine** as LIMS (`LimsList.tsx`):

| State | Left Panel | Middle Panel | Right Panel |
|-------|-----------|-------------|-------------|
| List | Mixed table (folders + entries) | — | — |
| Detail | Mixed table | Entry detail card (ID, title, type, created, author, folder, content preview) | — |
| Expanded | Collapsed strip | Entry detail card | Full ElnEditor (embedded) |

Back navigation from expanded: `[<]` → detail card, `[x]` → list at current folder path.

---

## Rationale

### Why not a tree sidebar + content pane

- **Different interaction model.** A tree sidebar requires collapsing/expanding nodes to navigate, which is a separate interaction vocabulary from the LIMS three-step fold. Users would need to learn and switch between two navigation paradigms.
- **Wasted horizontal space.** The tree sidebar consumes ~250px permanently, even when the user isn't actively navigating. The breadcrumb bar is ~40px tall and reclaims vertical space.
- **No code reuse.** The entire LIMS component tree (collapsed strip, detail card, expanded panel, state machine, CSS animations) would be re-implemented from scratch for a different layout. The mixed-table approach reuses the same orchestration pattern.

### Why a mixed table, not separate folder/entry sections

- **Familiarity.** Every file manager (Windows Explorer, macOS Finder, Google Drive) shows folders and files intermixed with folders first. Users already know this model.
- **Consistency with LIMS.** LIMS shows a single entity table. The Library shows a single items table. Same column arrangement, same row-click behavior.
- **Sorting is the differentiator.** Folders-first sorting provides visual grouping without a separate UI section. Adding a second section would require separate scroll containers, pagination, and selection state — complexity without benefit.

### Why embed the ElnEditor rather than navigate away

- **Preserves context.** The user stays in the Library at their current folder path. If the editor were a separate page (`/eln/:id`), the `[<]` back button would need to reconstruct the folder path from the entry's folder FK — possible but fragile.
- **Consistent three-panel feel.** LIMS expanded state shows the entity in the right panel; Library expanded state shows the entry in the right panel. Users learn one pattern for both.
- **The `/eln/:id` route remains as a direct-entry point** — bookmarks, shared links, and cross-references still work independently of the Library.

### Why a single API endpoint for mixed content

- **One request, one sort order.** Folders-first + entries-by-date sorting is applied server-side. Two endpoints would require merging and re-sorting on the client.
- **The Library is the abstraction.** Clients ask "what's at this path?" — not "what folders are here?" and "what entries are here?" separately. The API speaks the Library's language.

---

## Consequences

### Current benefits

- **Code reuse.** The Library page can share the `ViewState` pattern, panel layout CSS, detail card structure, and exit-animation logic from `LimsList.tsx`.
- **Extensible.** When new item types are added (PDFs, spreadsheets, etc.), they appear in the same mixed table with their own icon and type label. The Library doesn't need a new section for each type.
- **Predictable navigation.** Breadcrumbs + up-button + folder-click = same navigation affordances as the OS file manager.

### Constraints

- **Folders are navigated into, not previewed.** Clicking a folder row immediately changes the path. There is no "folder detail card" — folders have minimal metadata (name only, for now). This is deliberate: folders are containers, not content.
- **The content preview requires an additional API call.** When a detail card opens for an entry, we must fetch the full entry (with content JSON) to render the preview. The list endpoint returns lightweight items without content. A loading indicator bridges the gap.
- **No drag-and-drop moving.** Entries are assigned to a folder at creation and stay there. Moving between folders is deferred to a future feature.
- **Type column is a placeholder.** The column exists for consistency with LIMS but shows `—` for all rows until entry types are designed.

### Future considerations

- **Folder metadata.** Folders may eventually carry display IDs, creation dates, and permissions — at which point those columns fill in from `—`.
- **Multi-type Library.** When PDF uploads, spreadsheets, or protocols are added, each gets a type icon and label. The Type column becomes the primary differentiator in the mixed table.
- **Global search across folders.** The search bar currently filters within the current folder. A "search all folders" toggle or global search mode would require a different API query.
- **Bulk operations.** Selecting multiple items to move, delete, or export — the mixed table is checkable by design (checkbox column on the left, matching LIMS if added there too).
