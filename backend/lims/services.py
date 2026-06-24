"""
Service functions for LIMS entity sync.

sync_entities walks TipTap JSON for limsTable nodes, reads the JSON
attribute model (attrs.columns + attrs.rows), diffs against existing
Entity rows for the owning entry, creates/updates/deletes entities,
and patches the entity display IDs back into attrs.rows.
"""
from .models import EntityType, Entity


def _walk_lims_tables(node, handler):
    """
    Walk a TipTap JSON tree. Call ``handler(lims_table_node)`` for each
    ``limsTable`` node found. Returns a modified copy of the tree (or the
    same tree if handler returns None).
    """
    if not isinstance(node, dict):
        return node

    if node.get("type") == "limsTable":
        return handler(node)

    # Recurse into content arrays and nested objects
    modified = False
    new_node = dict(node)
    for key, value in node.items():
        if key == "content" and isinstance(value, list):
            new_children = []
            for child in value:
                new_child = _walk_lims_tables(child, handler)
                if new_child is not child:
                    modified = True
                new_children.append(new_child)
            new_node[key] = new_children
        elif isinstance(value, dict):
            new_val = _walk_lims_tables(value, handler)
            if new_val is not value:
                modified = True
            new_node[key] = new_val
        elif isinstance(value, list):
            new_list = []
            for item in value:
                if isinstance(item, dict):
                    new_item = _walk_lims_tables(item, handler)
                    if new_item is not item:
                        modified = True
                    new_list.append(new_item)
                else:
                    new_list.append(item)
            new_node[key] = new_list

    return new_node


def sync_entities(entry, tiptap_json):
    """
    Sync the Entity rows for *entry* to match the limsTable nodes in *tiptap_json*.

    1. Walk the JSON for nodes with ``type == "limsTable"``.
    2. For each: read ``attrs.rows`` (array of {entityId, displayId, values}).
    3. Diff against existing Entity rows for this ``source_entry``.
    4. Create new entities (generate display_id), update existing entity
       properties, delete removed entities.
    5. Patch entityId and displayId back into each row in ``attrs.rows``.
    6. Return the updated content dict.

    Plain tables (``schemaId`` is null) and tables with inactive schemas are skipped.
    """
    # Cache of schema_id → EntityType for quick lookup
    schema_cache = {}

    def handle_lims_table(node):
        attrs = node.get("attrs", {})
        schema_id = attrs.get("schemaId")

        if schema_id is None:
            # Plain table — skip entity sync
            return node

        # Load schema if not cached
        if schema_id not in schema_cache:
            try:
                et = EntityType.objects.get(pk=schema_id)
            except EntityType.DoesNotExist:
                return node
            if not et.is_active:
                return node
            schema_cache[schema_id] = et

        entity_type = schema_cache[schema_id]
        columns = attrs.get("columns", [])
        rows = attrs.get("rows", [])
        table_title = attrs.get("title", "Table")

        # Get existing entities for this source_entry + schema
        existing_entities = list(
            Entity.objects.filter(
                source_entry=entry,
                entity_type=entity_type,
            )
        )
        existing_by_display_id = {e.display_id: e for e in existing_entities}

        new_rows = []
        seen_display_ids = set()

        for i, row in enumerate(rows):
            entity_id = row.get("entityId")
            display_id = row.get("displayId", "")
            values = row.get("values", {})

            # Build properties dict from column definitions
            properties = {}
            for col_def in columns:
                col_name = col_def["name"]
                properties[col_name] = values.get(
                    col_name, col_def.get("default", "")
                )

            if entity_id and display_id and display_id in existing_by_display_id:
                # Update existing entity
                entity = existing_by_display_id[display_id]
                entity.properties = properties
                entity.name = f"{table_title} row {i + 1}"
                entity.save(update_fields=["properties", "name"])
                new_rows.append({
                    **row,
                    "entityId": entity.id,
                    "displayId": entity.display_id,
                })
                seen_display_ids.add(entity.display_id)
            else:
                # Create new entity
                entity = Entity.objects.create(
                    name=f"{table_title} row {i + 1}",
                    entity_type=entity_type,
                    properties=properties,
                    source_entry=entry,
                    folder=entry.folder,
                    created_by=entry.author,
                )
                new_rows.append({
                    **row,
                    "entityId": entity.id,
                    "displayId": entity.display_id,
                })
                seen_display_ids.add(entity.display_id)

        # Delete entities that were removed from the table
        for e in existing_entities:
            if e.display_id not in seen_display_ids:
                e.delete()

        # Return updated node with patched rows
        new_node = dict(node)
        new_node["attrs"] = dict(attrs)
        new_node["attrs"]["rows"] = new_rows
        return new_node

    return _walk_lims_tables(tiptap_json, handle_lims_table)
