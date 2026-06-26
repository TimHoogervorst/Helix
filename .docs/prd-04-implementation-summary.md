# PRD-04 Implementation Summary

**Date:** 2026-06-24
**Tests:** 63 passing (7 model + 13 API + 7 service + 36 existing)

## Backend

### Model Changes
- **EntityType**: added `prefix` (unique, uppercase), `columns` (ordered JSON array), `is_active` (soft-delete flag)
- **Entity**: added `display_id` (auto-generated `{prefix}{number}`), `source_entry` (FK → NotebookEntry); removed `barcode`
- Migration `0002` with RunPython to backfill existing rows

### API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| `GET/POST/PUT/DELETE` | `/api/lims/entity-types/` | Full CRUD, delete = soft-delete |
| `GET/POST/PUT/DELETE` | `/api/lims/entities/{display_id}/` | CRUD, lookup by display_id |
| `POST` | `/api/lims/entities/batch/` | Batch resolve entity IDs |
| `GET` | `/api/lims/entities/?search=&type=` | Paginated list with filters |

### Services
- **`sync_entities(entry, tiptap_json)`** — walks `limsTable` nodes, creates/updates/deletes entities, patches `entityIds` into content
- **Dynamic PREFIX_MAP** — entity prefixes auto-registered for `#` reference resolution
- Integrated into ELN save flow: `sync_entities` → `sync_mentions` → save patched content

## Frontend

### New Pages
- **`/lims`** — entity browser with search, type filter, paginated table, detail card
- **`/settings`** — schema management with column editor, drag-to-reorder, create/soft-delete

### Editor Integration
- **`limsTable`** TipTap node with schema-backed table support
- **`LimsEntityProvider`** context — batch-resolves entity IDs on load/save (mirrors ReferenceProvider pattern)
- Save response content replaces editor state (entityIds patched by backend)
- Reference cells inside tables trigger mention sync via `walk_reference_nodes`

### Navigation
- Layout updated: Notebook tab | LIMS tab | ⚙️ Settings gear

## Key Design Decisions
1. LIMS is source of truth for entity data; ELN is the editing interface
2. `sync_entities` mirrors `sync_mentions` pattern (walk JSON → diff → create/update/delete)
3. Dynamic PREFIX_MAP loads entity prefixes lazily from DB
4. Frontend uses same batch-resolution pattern for entities as references
5. Soft-delete schemas, hard-delete entities
