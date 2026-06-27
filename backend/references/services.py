"""
Compatibility re-exports.

Import from the sub-modules directly for new code:
- ``references.prefix_resolver`` — resolve_display_id, get_prefix_map, get_icon
- ``references.node_walker`` — collect_reference_ids
- ``references.mention_sync`` — sync_mentions
"""
from references.mention_sync import sync_mentions
from references.node_walker import collect_reference_ids
from references.prefix_resolver import (
    get_icon,
    get_model_type_map,
    get_prefix_map,
    resolve_display_id,
)

# Legacy aliases for any external callers using the private names
_get_dynamic_prefix_map = get_prefix_map
_get_dynamic_model_type_map = get_model_type_map
_get_icon = get_icon
walk_reference_nodes = collect_reference_ids

__all__ = [
    # New public names
    "collect_reference_ids",
    "get_icon",
    "get_model_type_map",
    "get_prefix_map",
    "resolve_display_id",
    "sync_mentions",
    # Legacy
    "_get_dynamic_model_type_map",
    "_get_dynamic_prefix_map",
    "_get_icon",
    "walk_reference_nodes",
]
