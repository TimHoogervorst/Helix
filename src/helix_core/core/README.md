# Core

Shared platform app containing the preserved `core` Django label.

## Architecture

`core` is part of the Platform (`helix_core`). It provides the User, Project,
Folder, CoreSetting, abstract models, walker utilities, and shared infrastructure
that Bundled and External Mods consume. Its app label remains `core` so existing
auth configuration, foreign keys, and migrations remain valid.

## Key Abstractions

| Module | Purpose |
|--------|---------|
| `abstracts.py` | `BrowsableItem` abstract base model — common fields (display_id, name, created/updated timestamps), used by both ELN `NotebookEntry` and LIMS `Entity` |
| `walker.py` | `walk_tiptap_tree()` — recursive TipTap document tree walker. Finds all mentions and limsTable nodes by type, used by sync pipelines |
| `models.py` | `User` (custom user model), `Folder` (hierarchical folder tree for the Library Console) |
| `serializers.py` | Shared serializers for User and Folder |
| `views.py` | Folder CRUD API endpoints |

## Dependencies

- **Depends on:** Django, DRF
- **Consumed by:** `bundled.*`, `mods.*`, `helix_core.mentions`

## Files

| File | Purpose |
|------|---------|
| `abstracts.py` | Abstract base models (BrowsableItem) |
| `walker.py` | TipTap document tree traversal |
| `models.py` | User, Folder models |
| `management/commands/seed_data.py` | Dev seed data command |
