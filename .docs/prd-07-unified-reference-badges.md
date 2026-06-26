# PRD-07: Unified Reference Badge System

> Status: `ready-for-agent`
> Date: 2026-06-26
> Parent: [PRD-03](prd-03-inline-references.md), [PRD-04](prd-04-lims-integration.md)

---

## Problem Statement

The current system has two separate visual treatments for display IDs:

- **`.reference-node`** — a blue clickable pill used for inline `#` mentions in the ELN editor. Has loading/resolved/broken states.
- **`.eln-badge`** — a gray monospace box used in list tables, detail cards, and editor headers. Just shows the display ID as plain styled text. Never clickable.

These two systems don't share code, don't share resolution logic, and send conflicting signals to the user. A display ID should look and behave consistently — the only thing that should vary is whether it's clickable.

Additionally, there are two separate resolution contexts (`ReferenceProvider` + `LimsEntityProvider`) that could be one, and the entity type system has no visual identity in references.

## Solution

A single **`ReferenceBadge`** component that renders any display ID as a pill badge. The badge auto-resolves via a unified `ReferenceProvider` context (or accepts pre-resolved data from the parent). It has two visual modes:

| Mode | Color | Cursor | Use case |
|------|-------|--------|----------|
| **Clickable** | Blue | Pointer, navigates on click | Inline mentions, Reference-type cells, LIMS table displayId column |
| **Non-clickable** | Gray | Default, no navigation | List rows, detail cards, editor header (self-reference) |

The system also introduces per-entity-type emoji icons so each entity type has a distinct visual identity in badges.

---

## User Stories

1. As a scientist, I want every display ID in the system to look like a consistent pill badge, so that I immediately recognize references to entries and entities wherever I see them.
2. As a scientist, I want clickable badges to be blue and non-clickable badges to be gray, so that I can tell at a glance whether I can navigate to the referenced item.
3. As a scientist, I want clicking a badge for an ELN entry to navigate to that entry, so that I can jump between related notes.
4. As a scientist, I want clicking a badge for a LIMS entity to open the entity detail in the LIMS browser, so that I can inspect sample data.
5. As a scientist, I want badges in list tables and detail cards to be non-clickable (gray), so that I don't accidentally navigate away while browsing.
6. As a scientist, I want broken references (typed display IDs that don't exist) to show as a red pill, so that I can identify and fix dead links.
7. As a scientist, I want the `#` autocomplete to work inside table cells in the editor, so that I can reference entities while filling in LIMS tables.
8. As a scientist, I want Reference-type cells in LIMS tables to provide smart autocomplete as I type a display ID, so that I can quickly fill in references without typing `#`.
9. As a scientist, I want each entity type to have its own emoji icon that appears in badges, so that I can distinguish samples, DNA, blood, etc. at a glance.
10. As a lab manager, I want to configure the emoji for each entity type in the settings page, so that our lab's visual vocabulary matches our domain.
11. As a developer, I want a single `ReferenceProvider` context that resolves any display ID (entry or entity), so that I don't need to wire up separate providers for different badge types.
12. As a developer, I want a single `ReferenceBadge` component with a clear prop API, so that I can drop badges into any page without duplicating logic.

---

## Implementation Decisions

### 1. Single `ReferenceBadge` component replaces both `.reference-node` and `.eln-badge`

The `ReferenceBadge` component is the single source of truth for rendering a display ID as a badge. It knows nothing about TipTap — it's a pure React component usable anywhere.

**Props API:**

```typescript
interface BadgeResolved {
  displayId: string;
  title: string;
  type: "entry" | "entity";
  id: number;
  icon: string;
}

interface ReferenceBadgeProps {
  displayId: string;                      // required — e.g. "E1", "BLOOD5"
  clickable?: boolean;                    // default false → gray, true → blue
  resolved?: BadgeResolved | null;        // pre-resolved data (skips auto-resolve)
}
```

**Behavior matrix:**

| `clickable` | `resolved` | Renders |
|---|---|---|
| `false` (default) | Pre-resolved data | Gray pill, icon + displayId + title, no link |
| `true` | Pre-resolved data | Blue pill, icon + displayId + title, clickable link |
| `true` | Omitted | Blue pill, auto-resolves via context → loading → resolved/broken |
| `true` | `null` | Red pill, displayId only, no icon ("broken reference") |
| `false` | Omitted/`null` | Bare displayId text, no styling (nothing to show) |

### 2. Blue = clickable, gray = non-clickable

- **Blue pill** (`background: var(--blue-50)`, `border: 1px solid var(--blue-200)`, `color: var(--blue-700)`): the badge is a link. Shows cursor pointer on hover.
- **Gray pill** (`background: var(--gray-100)`, `color: var(--gray-500)`, monospace): the badge is decorative/identifying. No pointer cursor, no link.
- **Red pill** (`background: #fef2f2`, `border: 1px solid #fecaca`, `color: #dc2626`): broken reference. No icon. Clickable mode only.

The existing `.reference-node` CSS and `.eln-badge` CSS are removed and replaced by `ReferenceBadge` styles.

### 3. Click navigation targets

| Reference type | Click target |
|---|---|
| ELN entry | `/eln/{id}` |
| LIMS entity | `/lims?entity={displayId}` — opens LIMS page with entity pre-selected in detail panel |

### 4. All eight insertion points

| # | Location | File | Clickable? | Resolution |
|---|---|---|---|---|
| 1 | Editor inline `#` mentions | `ReferenceNode.tsx` (TipTap NodeView) | Blue ✅ | Auto-resolve via context |
| 2 | Editor header display ID | `ElnEditor.tsx` metadata area | Gray ❌ | Pre-resolved from loaded entry |
| 3 | LIMS list table rows | `LimsList.tsx` | Gray ❌ | Pre-resolved from list data |
| 4 | LIMS detail card header | `LimsDetailCard.tsx` | Gray ❌ | Pre-resolved from selected entity |
| 5 | ELN list page rows | `ElnList.tsx` | Gray ❌ | Pre-resolved from list data |
| 6 | Schema Reference cells (LIMS table, AG Grid) | `LimsTableNode.tsx` | Blue ✅ | Auto-resolve via context |
| 7 | LIMS table `displayId` column (AG Grid) | `LimsTableNode.tsx` | Blue ✅ | Auto-resolve via context |
| 8 | LIMS table `displayId` column — new rows | `LimsTableNode.tsx` | None | Plain `#new-1` text, no badge until saved |

### 5. Unified `ReferenceProvider` in `Layout`

The existing `ReferenceProvider` already calls `POST /api/references/resolve/` and handles both entries and entities. It moves from inside `ElnEditor` to `Layout.tsx`, wrapping all routes so every page can use badge resolution without re-wrapping.

`LimsEntityProvider` is removed — its functionality is folded into the unified `ReferenceProvider`.

```tsx
// Layout.tsx
function Layout() {
  return (
    <ReferenceProvider>
      <NavBar />
      <Outlet />
    </ReferenceProvider>
  );
}
```

### 6. `ReferenceNode` becomes a thin TipTap wrapper

`ReferenceNode.tsx` (the TipTap React NodeView) shrinks to extracting `displayId` from `node.attrs` and rendering:

```tsx
<ReferenceBadge displayId={attrs.displayId} clickable />
```

All resolution logic and rendering moves to `ReferenceBadge`.

### 7. AG Grid cell renderers

Two custom AG Grid cell renderers:

**`displayId` column renderer:**
- If value matches `/^[A-Z]\d+$/` (real display ID): render `<ReferenceBadge clickable />`
- If value matches `#new-*` (placeholder): render plain text, no badge
- Once a row is saved and gets a real displayId, the badge appears on next render

**Reference-type column renderer:**
- Render `<ReferenceBadge clickable />` for resolved display IDs
- During editing: smart autocomplete that calls `/api/references/search/?q=` without requiring `#` trigger

### 8. Terminology (ubiquitous language)

| Term | Meaning |
|------|---------|
| **Reference** | The overall system for referring to items |
| **Referring** | The act of making a reference |
| **Badge** | The visual pill (blue, gray, or red) |
| **ReferenceBadge** | The React component |
| **Display ID** | The human-readable identifier (e.g. `E1`, `BLOOD5`) |

All code naming aligns to this vocabulary.

### 9. Entity type emoji (`EntityType.icon`)

A new `icon` field on `EntityType`:

```python
icon = models.CharField(
    max_length=10,
    default="🧪",
    help_text="Single emoji used as the icon for this entity type in reference badges."
)
```

Curated starter set shown in the settings UI: 🧪 (default/tube), 🩸 (blood), 🐁 (mouse), 🌿 (plant), 👤 (person), 🧬 (DNA), 🔬 (cell).

The settings page shows a small clickable popover: clicking the current emoji reveals the curated options. The user picks one. This is a simple text field backed by a popover, not a full emoji picker library.

### 10. Backend API always returns icon

**`POST /api/references/resolve/`** response shape:

```json
{
  "E1": { "id": 1, "display_id": "E1", "title": "PCR Protocol", "type": "entry", "icon": "📄" },
  "BLOOD1": { "id": 5, "display_id": "BLOOD1", "title": "Sample #1", "type": "entity", "icon": "🩸" },
  "NONEXIST": null
}
```

**`GET /api/references/search/?q=`** response shape:

```json
{
  "results": [
    { "display_id": "E1", "title": "PCR Protocol", "type": "entry", "icon": "📄" },
    { "display_id": "BLOOD1", "title": "Sample #1", "type": "entity", "icon": "🩸" }
  ]
}
```

- ELN entries: hardcoded `"icon": "📄"`
- LIMS entities: the entity type's configured icon, or `"🧪"` if none set

### 11. Expanded `#` autocomplete

`ReferenceSuggestion` currently restricts autocomplete to `paragraph` and `text` nodes. The `allow` function is expanded to also permit `tableCell` nodes so `#` autocomplete works inside TipTap table cells.

For AG Grid Reference-type cells (outside TipTap), a custom cell editor provides smart autocomplete: as the user types a display ID (no `#` prefix needed), it calls `GET /api/references/search/?q=` and shows a dropdown. Tab/Enter inserts the value.

### 12. Resolution infrastructure already unified

The existing `POST /api/references/resolve/` endpoint already handles all display ID prefixes via `PREFIX_MAP` (static `E → NotebookEntry` + dynamic entity prefixes from `EntityType` table). No backend refactoring needed — only the icon field addition.

### 13. Files to create

| File | Purpose |
|------|---------|
| `frontend/src/components/ReferenceBadge.tsx` | Unified badge component |
| `frontend/src/components/ReferenceBadgeCellRenderer.tsx` | AG Grid cell renderer wrapping ReferenceBadge |

### 14. Files to modify

| File | Change |
|------|--------|
| `frontend/src/components/ReferenceNode.tsx` | Thin wrapper around ReferenceBadge |
| `frontend/src/components/ReferenceProvider.tsx` | Move to Layout, absorb LimsEntityProvider functionality |
| `frontend/src/components/LimsEntityProvider.tsx` | **Delete** — folded into ReferenceProvider |
| `frontend/src/components/Layout.tsx` | Wrap children in ReferenceProvider |
| `frontend/src/components/ElnEditor.tsx` | Remove ReferenceProvider + LimsEntityProvider wrappers; use ReferenceBadge in header |
| `frontend/src/components/ElnList.tsx` | Replace `.eln-badge` with `<ReferenceBadge>` |
| `frontend/src/pages/LimsList.tsx` | Replace `.eln-badge` with `<ReferenceBadge>` |
| `frontend/src/components/LimsDetailCard.tsx` | Replace `.eln-badge` with `<ReferenceBadge>` |
| `frontend/src/components/LimsTableNode.tsx` | Wire AG Grid cell renderers for displayId and Reference columns |
| `frontend/src/extensions/ReferenceSuggestion.ts` | Expand `allow` to include tableCell nodes |
| `frontend/src/styles.css` | Remove `.reference-node` and `.eln-badge`; add `.reference-badge` styles |
| `frontend/src/types/references.ts` | Add `icon` to ResolvedRef and SearchResult |
| `frontend/src/types/lims.ts` | Add `icon` to EntityType |
| `frontend/src/pages/Settings.tsx` | Add emoji popover in entity type settings |
| `backend/lims/models.py` | Add `icon` field to EntityType |
| `backend/lims/serializers.py` | Include `icon` in EntityTypeSerializer; include icon in resolve/search |
| `backend/references/views.py` | Include `icon` in resolve_view and search_view responses |
| `backend/references/services.py` | Include icon in resolution results |

### 15. Files NOT changed

| File | Reason |
|------|--------|
| `backend/eln/models.py` (Mention) | GenericForeignKey already supports both entries and entities |
| `backend/references/services.py` (sync_mentions) | Already walks reference nodes for both types |
| `backend/lims/services.py` (sync_entities) | Already handles entity CRUD from LIMS tables |
| `frontend/src/context/LimsViewContext.tsx` | Unrelated — manages three-panel view state |
| `LimsCollapsedStrip.tsx`, `LimsMoreDetailPanel.tsx` | No badges in these components |

---

## Testing Decisions

### What makes a good test

- Test the `ReferenceBadge` component in isolation with all prop combinations (clickable/non-clickable × resolved/loading/broken)
- Test that the unified `POST /api/references/resolve/` returns correct `icon` for entries and entities
- Test that `GET /api/references/search/` returns `icon` in search results
- Test the `EntityType.icon` field: default value, validation
- Do NOT test AG Grid cell renderer DOM output — too brittle; verify manually
- Do NOT test TipTap suggestion dropdown behavior in unit tests

### Seams and modules

1. **ReferenceBadge component seam** — test with React Testing Library. Verify blue/gray/red rendering, link href generation for entries vs entities, loading state.
2. **API seams** — test resolve and search endpoints include `icon` field. Test with both entries and entities.
3. **EntityType model seam** — test icon field defaults to 🧪, survives round-trip through serializer.
4. **ReferenceProvider seam** — test that it batch-resolves mixed entry+entity IDs through the unified endpoint.

### Prior art

Follow existing test patterns:
- Frontend components: same patterns as existing component tests
- Backend APIs: `APITestCase` in `backend/references/tests/` and `backend/lims/tests/`

---

## Out of Scope

- **Autosaving** — navigation away from editor currently loses unsaved changes. Autosave is a separate feature.
- **Tabs / new-tab navigation** — badges currently navigate in the same tab. Opening in new tabs is future work.
- **Mention model changes** — the `Mention` table already uses GenericForeignKey and supports both entries and entities. No changes needed.
- **Three-panel LIMS layout redesign** — moving the properties table from `LimsDetailCard` to `LimsMoreDetailPanel` is tracked separately in PRD-06.
- **Full emoji picker library** — only the curated set of ~6 emojis in a popover. No external emoji picker dependency.
- **Backlink display** — showing "which entries reference this entity/entry?" is out of scope.
- **Rich hover cards** — no hover preview of the referenced item.
- **Mention notifications** — no alert when something gets referenced.
- **Non-ELN sources** — only `NotebookEntry` can contain reference nodes currently. Entities and other models gain this when they get rich-text content.

---

## Further Notes

- The existing `ReferenceProvider` at `frontend/src/components/ReferenceProvider.tsx` already calls the unified backend endpoint and already stores `type: "entry" | "entity"` in its resolution map. The infrastructure is already mostly unified — this PRD is primarily about the frontend component layer and filling in the icon.
- The `PREFIX_MAP` in `backend/references/services.py` dynamically loads entity prefixes from the `EntityType` table at runtime. This means new entity types automatically get reference resolution with zero backend changes beyond the icon field.
- The curated emoji set was chosen to cover common lab entity types. The set can be expanded later by editing a constant array — no migration needed.
- Reference nodes inside code blocks or other non-editable contexts are already excluded from mention sync by the TipTap schema (reference nodes are only valid in text content).

---

## Domain Model Update

This PRD establishes the following domain terms:

```
Reference (system)
├── Referring (action)
├── Display ID (identifier, e.g. "E1", "BLOOD5")
├── ReferenceBadge (component)
│   ├── Clickable (blue pill)
│   └── Non-clickable (gray pill)
├── ReferenceProvider (context)
├── ReferenceNode (TipTap wrapper)
└── Broken Reference (red pill)
```
