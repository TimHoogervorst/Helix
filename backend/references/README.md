# References

Cross-cutting reference resolution system — resolves `@ref:` mentions to target items
across all workspace domains.

## Architecture

References are a cross-cutting concern: an ELN entry can reference a LIMS entity,
another ELN entry, or any future item type. The references app provides a centralized
resolution service with a pluggable prefix map.

## PREFIX_MAP

`services.py` defines `PREFIX_MAP` — a registry mapping reference prefixes to target models:

| Prefix | Target Model | App |
|--------|-------------|-----|
| `E` | `NotebookEntry` | `workspaces.eln` |
| (future) | (extensible) | — |

## API Endpoints

| Endpoint | View | Purpose |
|----------|------|---------|
| `GET /api/references/resolve/` | `resolve_references` | Resolve a batch of `@ref:` display IDs to titles and URLs |

## Services

| Function | Purpose |
|----------|---------|
| `sync_mentions()` | Sync `Mention` rows when an entry is saved (called from ELN sync pipeline) |
| `resolve_references()` | Batch-resolve references by display ID for frontend display |

## Dependencies

- **Depends on:** `core` (walker), `workspaces.eln` (NotebookEntry, Mention — lazy imports), `workspaces.lims` (Entity, EntityType — lazy imports)
- **Consumed by:** `workspaces.eln` (sync pipeline), frontend `ReferenceBadge` component

## Files

| File | Purpose |
|------|---------|
| `services.py` | Reference resolution, PREFIX_MAP, sync_mentions |
| `views.py` | Resolve endpoint |
| `urls.py` | URL routing |
