# ELN Workspace (Backend)

Entry workspace — NotebookEntry model, reference parsing, sync pipeline, and API endpoints.

## Model

| Model | Inherits | Key Fields |
|-------|----------|------------|
| `NotebookEntry` | `core.BrowsableItem` | `content` (TipTap JSON), `author`, `folder` (FK to core.Folder) |
| `Mention` | `django.db.models.Model` | Generic FK to source (content_object), `target_type`, `target_id`, `context` |

## Sync Pipeline

`sync.py` orchestrates the content analysis pipeline when an entry is saved:

1. **Parse references** → `parser.py` extracts `@ref:` mentions from TipTap content
2. **Sync mentions** → creates/updates `Mention` rows with generic FK targets
3. **Sync entities** → delegates to `workspaces.lims.services.sync_entities()` for limsTable nodes

## API Endpoints

| Endpoint | View | Purpose |
|----------|------|---------|
| `GET/POST /api/eln/entries/` | `NotebookEntryViewSet` | List and create entries |
| `GET/PUT/PATCH/DELETE /api/eln/entries/:id/` | `NotebookEntryViewSet` | Retrieve, update, delete entry |
| `GET /api/eln/entries/by-display-id/:display_id/` | custom action | Lookup by display ID |

## Dependencies

- **Depends on:** `core` (BrowsableItem, walker), `workspaces.lims` (entity sync — soft dependency via import in sync.py)
- **Consumed by:** `console.library` (ViewSet for Library), `references` (mention resolution), frontend (`/api/eln/`)

## Files

| File | Purpose |
|------|---------|
| `models.py` | NotebookEntry, Mention models |
| `parser.py` | Parse `@ref:` mentions from TipTap document JSON |
| `sync.py` | Content sync pipeline (parse → mention → entity) |
| `serializers.py` | DRF serializers |
| `views.py` | NotebookEntryViewSet |
| `urls.py` | URL routing |
