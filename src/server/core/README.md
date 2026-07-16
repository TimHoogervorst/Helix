# Core

Shared base classes and utilities used by all workspace and console apps.

## Architecture

`core` is the foundation layer — it provides the abstract models, walker utilities,
and shared infrastructure that every other app depends on. It has zero dependencies
on other OpenScience apps.

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
- **Consumed by:** `core_mods.eln`, `core_mods.lims`, `core_mods.library`, `references`

## Files

| File | Purpose |
|------|---------|
| `abstracts.py` | Abstract base models (BrowsableItem) |
| `walker.py` | TipTap document tree traversal |
| `models.py` | User, Folder models |
| `management/commands/seed_data.py` | Dev seed data command |
