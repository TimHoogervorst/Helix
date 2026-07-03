# LIMS Workspace (Backend)

Entity workspace — Entity and EntityType models, column schema, sync services, and API endpoints.

## Model

| Model | Inherits | Key Fields |
|-------|----------|------------|
| `Entity` | `core.BrowsableItem` | `entity_type` (FK to EntityType), `data` (JSON), `created_by` (FK to core.User) |
| `EntityType` | `django.db.models.Model` | `name`, `schema` (JSON — column definitions), `icon` |
| `Action` | `django.db.models.Model` | `entity` (FK to Entity), `action_type`, `description`, `performed_by` |

## Column Schema

`EntityType.schema` is a JSON array of column definitions. Each column has `key`, `label`, and `type`.
The schema drives the table layout in the LIMS Console frontend.

## Sync Services

`services.py` provides `sync_entities()` — called by the ELN sync pipeline when a
`limsTable` node is found in TipTap content. It creates/updates Entity and EntityType
rows based on the table data.

## API Endpoints

| Endpoint | View | Purpose |
|----------|------|---------|
| `GET/POST /api/lims/entities/` | `EntityViewSet` | List and create entities |
| `GET/PUT/PATCH/DELETE /api/lims/entities/:id/` | `EntityViewSet` | Retrieve, update, delete entity |
| `GET/POST /api/lims/entity-types/` | `EntityTypeViewSet` | List and create entity types |

## Dependencies

- **Depends on:** `core` (BrowsableItem, walker)
- **Consumed by:** `workspaces.eln` (sync pipeline), `references` (target resolution), frontend (`/api/lims/`)

## Files

| File | Purpose |
|------|---------|
| `models.py` | Entity, EntityType, Action models |
| `services.py` | Entity sync service (called from ELN pipeline) |
| `serializers.py` | DRF serializers |
| `views.py` | EntityViewSet, EntityTypeViewSet |
| `urls.py` | URL routing |
