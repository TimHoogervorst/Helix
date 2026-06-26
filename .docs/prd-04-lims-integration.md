# PRD-04: LIMS Integration

**Status:** `ready-for-agent`
**Date:** 2026-06-24

## Overview

Add full LIMS (Laboratory Information Management System) functionality to the OpenScience ELN. Users can create schema-backed sample tables in their notebook entries, browse all LIMS entities in a dedicated Data tab, and manage schemas (entity types with column definitions) via a Settings page.

---

## Domain Model

### Core Concepts

| Concept | Definition | Source of Truth |
|---------|-----------|-----------------|
| **EntityType / Schema** | Defines column structure + prefix for a class of entities. Managed in Settings. | Settings |
| **Entity** | A single record (sample, reagent, material). Has `display_id = {prefix}{number}`, `properties` JSON, owned by one ELN entry via `source_entry`. | LIMS |
| **Plain Table** | Ad-hoc TipTap table in ELN content. No LIMS backing. Purely visual/freeform. | ELN content JSON |
| **Schema-backed Table** | `limsTable` TipTap node with `schemaId` + `entityIds`. Columns from schema, data from LIMS. Custom columns = text-only, per-table scope. | LIMS (data), ELN JSON (structure) |

### Data Types for Schema Columns

| Type | Stores | Example |
|------|--------|---------|
| **Text** | Free text | "Patient A" |
| **Number** | Numeric value | `42`, `3.14` |
| **Date** | Date only | `2026-06-24` |
| **Boolean** | Checkbox / yes-no | `true` / `false` |
| **Reference** | A `#` ID pointing to any entity | `#E1`, `#S3`, `#BLOOD7` |

Choice/dropdown type is deferred to a future PRD.

### Entity ID System

- Each schema gets a **user-chosen prefix** (e.g., `S`, `BLOOD`, `DNA`). Must be uppercase letters.
- Entities auto-generate display IDs: `{prefix}1`, `{prefix}2`, etc. — numbers auto-increment per prefix independently.
- Prefixes are registered in `PREFIX_MAP` so `#BLOOD1` in ELN text resolves via the existing reference infrastructure.

### Navigation

```
┌──────────────────────────────────────────────┐
│  OpenScience   Notebook  LIMS          ⚙️   │
└──────────────────────────────────────────────┘
```

- **Notebook** (`/eln`) — existing ELN entries
- **LIMS** (`/lims`) — entity browser (new)
- **⚙️** (`/settings`) — schema management (new)

### Entity Ownership

- Each `Entity` belongs to one ELN entry via `source_entry` FK → `NotebookEntry`.
- Changes to entities go through the ELN: edit the table in the entry, save → entity synced.
- The LIMS browser is read-only.
- SDC (Structured Data Capture) with full history/audit trail is deferred to a future PRD.

### Schema Lifecycle

- Schemas are created, updated, and soft-deleted (`is_active=false`) in Settings.
- Soft-deleted schemas: hidden from "Load Schema" dropdowns, existing entities preserved, existing tables still render.
- Deleting an active schema with existing entities is blocked (or warned about) — future topic.

### Column Ordering

- Schema columns are stored as an ordered JSON array.
- Drag-to-reorder supported in the Settings column editor.

---

## Model Changes

### EntityType (Schema)

| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField(255, unique) | Existing — schema name, e.g., "Blood Sample" |
| `prefix` | CharField(20, unique) | **New** — user-chosen, uppercase letters, e.g., `BLOOD` |
| `columns` | JSONField(default=list) | **New** — ordered array of `{name, type, required, default, units, description}` |
| `is_active` | BooleanField(default=True) | **New** — soft-delete flag |

### Entity

| Field | Type | Notes |
|-------|------|-------|
| `display_id` | CharField(50, unique) | **New** — auto-generated `{prefix}{number}`, replaces `barcode` |
| `name` | CharField(500) | Existing — user-given name |
| `entity_type` | FK → EntityType | Existing — the schema this entity belongs to |
| `properties` | JSONField(default=dict) | Existing — column values keyed by column name, plus custom fields |
| `source_entry` | FK → NotebookEntry | **New** — owning ELN entry (nullable for future non-ELN use) |
| `folder` | FK → Folder | Existing |
| `created_by` | FK → User | Existing |
| `created_at` | DateTime | Existing |
| ~~`barcode`~~ | — | **Removed** — replaced by `display_id` |

---

## API Surface

### New / Changed Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/lims/entity-types/` | List schemas (no pagination) |
| `POST` | `/api/lims/entity-types/` | Create schema |
| `PUT` | `/api/lims/entity-types/{id}/` | Update schema (name, columns, reorder) |
| `DELETE` | `/api/lims/entity-types/{id}/` | Soft-delete schema (sets `is_active=false`) |
| `GET` | `/api/lims/entities/` | List entities — paginated, filterable by `?search=` and `?type=` |
| `GET` | `/api/lims/entities/{display_id}/` | Entity detail (lookup by display_id, not pk) |
| `POST` | `/api/lims/entities/batch/` | Batch resolve `{"ids": ["BLOOD1", "BLOOD2"]}` → returns properties for each |

### Changed ELN Endpoints (internal behavior)

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/api/eln/entries/` | After save, calls `sync_entities()` → patches entityIds in content → returns updated content |
| `PUT` | `/api/eln/entries/{id}/` | Same sync_entities processing on update |

### Changed References Endpoints

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/api/references/resolve/` | Resolves entity display IDs (via dynamic PREFIX_MAP) |
| `GET` | `/api/references/search/` | Search includes entities matching prefix |

---

## Key Behaviors

### Save Flow (ELN Entry with Schema-backed Table)

1. User edits table cells in the editor and clicks Save
2. `POST/PUT /api/eln/entries/` sends the TipTap JSON including `limsTable` nodes
3. Backend `perform_create`/`perform_update` calls `sync_mentions()` (existing) then `sync_entities()`
4. `sync_entities()`:
   - Walks JSON for nodes with `type == "limsTable"`
   - For each: diffs `attrs.entityIds` against existing `Entity` rows for this `source_entry`
   - Creates new entities (generates `display_id`), updates existing entity `properties`, deletes removed entities
   - For Reference-type cells: `sync_mentions` handles creating Mention rows (since `walk_reference_nodes` recurses into `limsTable` children)
   - Patches new entity display IDs into `attrs.entityIds` (replaces `null` with `"BLOOD4"`)
   - Returns updated content dict
5. Backend saves the modified content to `NotebookEntry.content`
6. Response returned to frontend includes the updated content
7. Frontend replaces editor state with response content (entityIds now filled in)

### Load Flow (ELN Entry with Schema-backed Table)

1. Entry loads → `GET /api/eln/entries/{id}/` → content contains `limsTable` nodes with `entityIds`
2. Frontend scans content for `limsTable` nodes, collects all `entityIds`
3. Calls `POST /api/lims/entities/batch/` with collected IDs
4. Merges LIMS data into table cells:
   - Schema columns → values from LIMS `properties` (source of truth)
   - Custom columns → values from cached JSON (preserved, since LIMS doesn't know about custom columns)
5. Renders editor with live data
6. Cell content in the JSON is a display-only cache; always overwritten by live LIMS data on load

### Reference Cells in Tables

- When a schema column is type `Reference`, the `#` autocomplete works inside that cell
- Typing `#E` triggers the existing `ReferenceSuggestion` dropdown filtered to all searchable entities
- Selected reference is rendered as a blue badge (pill) inside the cell, same as inline references in prose
- On save, reference nodes inside table cells are picked up by `walk_reference_nodes` and synced as `Mention` rows
- Clicking an entry badge (`#E5`) navigates to `/eln/5` (ELN entry page)
- Clicking an entity badge (`#BLOOD1`) navigates to `/lims/BLOOD1` (LIMS entity detail page)
- Unsaved-changes guard fires before badge navigation

### Plain Tables

- Inserted via `/table` → "Plain Table" option
- Standard TipTap table with no `schemaId`, no `entityIds`, no LIMS backing
- Stored entirely in the ELN content JSON
- User can later click "Load Schema" on the table header to convert to schema-backed:
  - Existing rows become entities, cells mapped to schema columns by position
  - Extra columns beyond schema become custom text columns

### Custom Columns (Schema-backed Tables)

- User can add columns to a schema-backed table that aren't in the schema
- Custom columns are always Text type, no special behavior (no badges, no referalls)
- Per-table scope: only exist in this specific table in this ELN entry
- Removing a custom column clears that field from the entity's `properties` on save
- Adding a custom column does NOT propagate to the schema definition

### Table Header Bar

Every table (plain or schema-backed) has a collapsible header bar with:
- Editable title (default: "Table")
- Collapse/expand toggle (hides/shows table body rows)
- "Load Schema" button (on click: popup with searchable schema list; selecting a schema converts the table)

### `/table` Slash Command

- Typing `/table` in the editor opens a popup
- Popup shows: "Plain Table" option + searchable list of active schemas
- Selecting an option inserts the appropriate table node at cursor position

### Table Cell Rendering by Type

| Column Type | Cell UI |
|-------------|---------|
| Text | Standard text input |
| Number | Number input with small `#` indicator |
| Date | Native `<input type="date">` |
| Boolean | Checkbox |
| Reference | Text with `#` autocomplete; resolved values shown as blue badges |

### LIMS Browser Page (`/lims`)

- Flat table of all entities, paginated
- Search input (searches by `display_id` and `name`)
- Type dropdown (filters by schema/EntityType)
- Table columns: display_id badge, name, type, created_at, updated_at, owning ELN entry badge
- Click entity row → detail card slides open showing:
  - Field values from `properties` rendered per type
  - "Referenced in" section with ELN entry badges (from Mention reverse lookup)
- Read-only; editing happens in the ELN

### Settings Page (`/settings`)

- Full-page table of schemas: Name, Prefix, Column Count, Active status
- Click schema row → expands inline to show column editor
- Column editor:
  - List of columns with: name input, type dropdown, required checkbox, default value, units, description
  - Drag handles for reorder
  - Add column button, per-column delete button
  - Save/Cancel buttons
- "New Schema" button at top opens form (name + prefix)
- Delete = soft-delete (`is_active=false`)
- Only "Schemas" category for now; more settings categories later

---

## Implementation Plan

6 vertical slices, each independently testable. TDD approach: test → implementation → refactor.

### Slice 0: Backend Model Changes + Migration
- Add `prefix`, `columns`, `is_active` to `EntityType`
- Add `display_id`, `source_entry` to `Entity`; remove `barcode`
- Auto-generate `display_id` in `Entity.save()` (same pattern as `NotebookEntry.save()`)
- Migration with `RunPython` to backfill existing rows
- Tests: `backend/lims/tests/test_models.py`

### Slice 1: Backend EntityType CRUD + Dynamic PREFIX_MAP
- EntityTypeViewSet → ModelViewSet (full CRUD, soft-delete)
- Column validation (type must be in allowed set, prefix uppercase)
- Register entity prefixes in `PREFIX_MAP` dynamically
- Entity-aware resolve/search in references views
- Tests: extend `backend/lims/tests/test_api.py`, `backend/references/tests/`

### Slice 2: Backend Entity API + sync_entities Service
- EntityViewSet → ModelViewSet (lookup by display_id, search/type filters)
- Batch resolve endpoint (`POST /api/lims/entities/batch/`)
- `sync_entities(entry, tiptap_json)` service function
- Integrate into ELN save flow (`perform_create`/`perform_update`)
- Extend `walk_reference_nodes` into `limsTable` children
- Tests: `backend/lims/tests/test_services.py`, extend `backend/eln/tests/test_api.py`

### Slice 3: Frontend Navigation + LIMS Browser + Settings Page
- New routes: `/lims`, `/settings`
- Layout: LIMS nav tab, gear icon for settings
- `frontend/src/types/lims.ts` — type definitions
- `LimsList.tsx` — entity browser with search/filter/detail card
- `Settings.tsx` — schema management with column editor + drag-to-reorder
- `LimsEntityProvider.tsx` — context for batch entity resolution
- CSS for new components
- Dependency: none new

### Slice 4: Backend sync_entities Refinement
- Full `sync_entities` with reference cell mention sync
- Edge cases: plain table skip, inactive schema block, empty table no-op
- Transactional safety
- Tests: edge case coverage

### Slice 5: Frontend TipTap limsTable + Editor Integration
- `@tiptap/extension-table` dependency
- `LimsTable.ts` — TipTap node extension extending built-in table
- `TableSlashCommand.ts` — `/table` slash command with plain + schema list popup
- `LimsTableNode.tsx` — React NodeView with header bar
- `ElnEditor.tsx` — integrate LimsTable extension, LimsEntityProvider, save response content replacement, load batch fetch
- Allow `#` autocomplete inside `tableCell` nodes
- CSS for limsTable

### Slice 6: Edge Cases + Integration Verification
- Loading/error states for batch resolution
- Unsaved-changes guard before badge navigation
- Collapsed table summary
- Inactive schema handling (yellow badge, banner — placeholder for future)
- Full regression: `python manage.py test`
- End-to-end manual verification walkthrough

---

## Architecture Notes

### Patterns Reused
- **sync_entities mirrors sync_mentions**: Walk TipTap JSON, diff against DB, create/update/delete, return modified content
- **Dynamic PREFIX_MAP**: Lazy-load entity prefixes into the reference resolution map
- **Batch resolution**: `POST /api/lims/entities/batch/` mirrors `POST /api/references/resolve/`
- **LimsEntityProvider mirrors ReferenceProvider**: Collect IDs, batch-fetch, cache in Map, re-render nodes
- **TableSlashCommand mirrors ReferenceSuggestion**: Suggestion plugin pattern with debounced search
- **Entity display_id auto-generation mirrors NotebookEntry.display_id**: Query highest existing number, increment

### Key Design Principles
1. LIMS is source of truth for entity data; ELN is the editing interface
2. Plain tables = ELN-only; Schema-backed tables = LIMS-synced
3. Changes flow through ELN save → backend processes → returns authoritative content
4. Soft-delete schemas, hard-delete entities (broken references show as red pills)
5. Same Mention infrastructure for reference cells in tables as inline references
6. Frontend entity ID resolution uses the same batch pattern as reference resolution

---

## Out of Scope (Future PRDs)

- SDC (Structured Data Capture) with full history/audit trail on entities
- Choice/dropdown column type
- Units display next to number cells
- Bidirectional "mentioned by" UI in entry detail
- Hover cards for badge previews
- Schema versioning / migration
- Auth / permissions / accounts
- Physical barcode scanning
- Concurrent edit conflict resolution
- Entity sharing between multiple ELN entries
- Yellow badge + banner for inactive-schema entities
