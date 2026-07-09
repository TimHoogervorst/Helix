# ELN Workspace (Backend)

Entry workspace — NotebookEntry model, reference parsing, sync pipeline, and API endpoints.

## Model

| Model | Inherits | Key Fields |
|-------|----------|------------|
| `NotebookEntry` | `core.BrowsableItem` | `content` (TipTap JSON), `author`, `folder` (FK to core.Folder) |
| `Mention` | `django.db.models.Model` | Generic FK to source (content_object), `target_type`, `target_id`, `context` |

## Sync Pipeline

`sync.py` orchestrates the content analysis pipeline when an entry is saved:

1. **Walk content** → `core/mentions/node_walker.py` extracts `#`-triggered mentions from TipTap content
2. **Sync mentions** → creates/updates `Mention` rows with generic FK targets
3. **Sync entities** → delegates to `core_mods.lims.services.sync_entities()` for limsTable nodes

## API Endpoints

| Endpoint | View | Purpose |
|----------|------|---------|
| `GET/POST /api/eln/entries/` | `NotebookEntryViewSet` | List and create entries |
| `GET/PUT/PATCH/DELETE /api/eln/entries/:id/` | `NotebookEntryViewSet` | Retrieve, update, delete entry |
| `GET /api/eln/entries/by-display-id/:display_id/` | custom action | Lookup by display ID |

## Dependencies

- **Depends on:** `core` (BrowsableItem, walker), `core_mods.lims` (entity sync — soft dependency via import in sync.py)
- **Consumed by:** `console.library` (ViewSet for Library), `core.mentions` (mention resolution), frontend (`/api/eln/`)

## Files

| File | Purpose |
|------|---------|
| `models.py` | NotebookEntry, ContentVersion, EntryLock, ElnAction |
| `sync.py` | Content sync pipeline (walk → mention → entity) |
| `serializers.py` | DRF serializers |
| `views.py` | NotebookEntryViewSet |
| `urls.py` | URL routing |
