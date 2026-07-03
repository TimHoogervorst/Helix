# Library Console (Backend)

The Library Console's backend — folder browsing and mixed folder+entry listing.

## Model

The Library has no models of its own. It operates on:
- `core.Folder` — hierarchical folder tree
- `workspaces.eln.NotebookEntry` — ELN entries within folders

## API Endpoints

| Endpoint | View | Purpose |
|----------|------|---------|
| `GET /api/library/contents/` | `LibraryContentsView` | List folder contents (mixed folders + entries) |
| `POST /api/library/folders/` | `FolderViewSet` (via core) | Create folder |
| `PUT /api/library/folders/:id/` | `FolderViewSet` (via core) | Update folder |
| `DELETE /api/library/folders/:id/` | `FolderViewSet` (via core) | Delete folder |

## Path-Based Browsing

`LibraryContentsView` accepts a `?path=` query parameter (e.g. `?path=/Experiments/Q1`)
and resolves it to a `core.Folder` by walking the folder tree. It returns a paginated
list of children — folders first, then entries.

## Dependencies

- **Depends on:** `core` (Folder model, FolderViewSet), `workspaces.eln` (NotebookEntry model)
- **Consumed by:** Frontend Library Console (`/api/library/`)

## Files

| File | Purpose |
|------|---------|
| `views.py` | LibraryContentsView (mixed folder+entry listing) |
| `urls.py` | URL routing |
