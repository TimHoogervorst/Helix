"""
Service functions for LIMS entity sync.

sync_entities walks TipTap JSON for limsTable nodes, reads the JSON
attribute model (attrs.columns + attrs.rows), diffs against existing
Entity rows for the owning entry, creates/updates/deletes entities,
and patches the entity display IDs back into attrs.rows.
"""
from rest_framework import serializers

from core.walker import walk_tiptap_tree

from .models import EntityType, Entity


def _walk_lims_tables(node, handler):
    """
    Walk a TipTap JSON tree. Call ``handler(lims_table_node)`` for each
    ``limsTable`` node found.

    Thin wrapper around ``core.walker.walk_tiptap_tree`` — the handler is
    only invoked for nodes whose ``type`` is ``"limsTable"``.
    """

    def lims_handler(n):
        if n.get("type") == "limsTable":
            return handler(n)
        return None

    return walk_tiptap_tree(node, lims_handler)


def sync_entities(entry, tiptap_json):
    """
    Sync the Entity rows for *entry* to match the limsTable nodes in *tiptap_json*.

    Strategy (two-pass to correctly handle multiple tables sharing one schema):

    1. **Collect** — walk the JSON for limsTable nodes, group them by
       ``schemaId``.  Plain tables and inactive schemas are skipped.
    2. **Reconcile** — for each schema group, collect ALL rows across ALL
       tables that use that schema.  Diff against the existing Entity set
       for ``(source_entry, entity_type)``.  Create / update / delete
       entities based on the full row set, so that entities belonging to
       *any* table with that schema survive.
    3. **Patch** — write the resolved ``entityId`` / ``displayId`` back
       into every row in every table.

    Returns the updated content dict (a deep copy).
    """
    # ── Pass 1: collect tables, group by schema ─────────────────────────
    schema_cache = {}          # schema_id → EntityType
    tables_by_schema = {}      # schema_id → list of dicts {node, columns, rows}

    def collect_lims_tables(node):
        """Walk helper — collect limsTable nodes into tables_by_schema."""
        attrs = node.get("attrs", {})
        schema_id = attrs.get("schemaId")

        if schema_id is None:
            return  # plain table, skip

        # Load schema if not cached
        if schema_id not in schema_cache:
            try:
                et = EntityType.objects.get(pk=schema_id)
            except EntityType.DoesNotExist:
                return
            if not et.is_active:
                return
            schema_cache[schema_id] = et

        tables_by_schema.setdefault(schema_id, []).append({
            "node": node,
            "columns": attrs.get("columns", []),
            "rows": attrs.get("rows", []),
            "title": attrs.get("title", "Table"),
        })

    _walk_lims_tables(tiptap_json, collect_lims_tables)

    if not tables_by_schema:
        return tiptap_json

    # ── Pass 2: reconcile entities per schema ───────────────────────────
    # Map: (schema_id, row_index within that schema's global row list) → entity
    row_entity_map = {}  # key = (schema_id, global_row_idx) → Entity

    for schema_id, tables in tables_by_schema.items():
        entity_type = schema_cache[schema_id]

        # Collect ALL rows across all tables for this schema
        # We track (table_idx, row_idx) so we can patch back later.
        all_rows = []  # list of (table_idx, row_idx, row_dict)
        for ti, table in enumerate(tables):
            for ri, row in enumerate(table["rows"]):
                all_rows.append((ti, ri, row))

        # Get existing entities for this source_entry + entity_type
        existing_entities = list(
            Entity.objects.filter(
                source_entry=entry,
                entity_type=entity_type,
            )
        )
        existing_by_id = {e.id: e for e in existing_entities}
        existing_by_display_id = {e.display_id: e for e in existing_entities}

        seen_entity_ids = set()

        for ti, ri, row in all_rows:
            entity_id = row.get("entityId")
            display_id = row.get("displayId", "")
            values = row.get("values", {})

            # Read entity name from the __name row key.
            # The frontend Name pseudo-column writes here (alongside "values", not inside it).
            entity_name = row.get("__name", "").strip()
            if not entity_name:
                raise serializers.ValidationError("Entity name is required.")

            # Build properties dict from column definitions
            table = tables[ti]
            properties = {}
            for col_def in table["columns"]:
                col_name = col_def["name"]
                properties[col_name] = values.get(
                    col_name, col_def.get("default", "")
                )

            # Resolve the existing entity
            entity = None
            if entity_id and entity_id in existing_by_id:
                entity = existing_by_id[entity_id]
            elif display_id and display_id in existing_by_display_id:
                entity = existing_by_display_id[display_id]

            if entity is not None:
                # Update existing entity
                entity.properties = properties
                entity.name = entity_name
                entity.save(update_fields=["properties", "name"])
            else:
                # Create new entity
                entity = Entity.objects.create(
                    name=entity_name,
                    entity_type=entity_type,
                    properties=properties,
                    source_entry=entry,
                    folder=entry.folder,
                    created_by=entry.author,
                )

            seen_entity_ids.add(entity.id)
            row_entity_map[(schema_id, ti, ri)] = entity

        # Delete entities that no longer appear in ANY table of this schema
        for e in existing_entities:
            if e.id not in seen_entity_ids:
                e.delete()

    # ── Pass 3: patch entityId / displayId back into the rows ───────────
    # Use encounter-order counters per schema to match tables between
    # the collect walk and the patch walk (node identity differs because
    # walk_tiptap_tree builds new dicts when handlers transform nodes).
    patch_counters = {sid: 0 for sid in tables_by_schema}

    def patch_lims_tables(node):
        """Walk helper — patch entityId/displayId into rows using row_entity_map."""
        attrs = node.get("attrs", {})
        schema_id = attrs.get("schemaId")

        if schema_id is None or schema_id not in tables_by_schema:
            return node

        ti = patch_counters[schema_id]
        patch_counters[schema_id] += 1

        table_info = tables_by_schema[schema_id][ti]
        new_rows = []
        for ri, row in enumerate(table_info["rows"]):
            entity = row_entity_map.get((schema_id, ti, ri))
            if entity is not None:
                new_rows.append({
                    **row,
                    "entityId": entity.id,
                    "displayId": entity.display_id,
                })
            else:
                new_rows.append(row)

        new_node = dict(node)
        new_node["attrs"] = dict(attrs)
        new_node["attrs"]["rows"] = new_rows
        return new_node

    return _walk_lims_tables(tiptap_json, patch_lims_tables)


def cascade_entry_status(*, source_entry_id: int, status: str) -> int:
    """Update the status of all Entities linked to a source NotebookEntry.

    Called via the service registry (``lims.cascadeEntryStatus``) from the
    ELN mod's ``post_save`` cascade handler.  Uses a direct SQL UPDATE so
    the query is a no-op when the status hasn't changed.

    Returns:
        The number of Entity rows updated.
    """
    from .models import Entity

    return Entity.objects.filter(source_entry_id=source_entry_id).update(
        status=status
    )


def get_entity_prefixes() -> list[str]:
    """Return all entity type prefix strings.

    Called via the service registry (``lims.getEntityPrefixes``) from the
    core mentions prefix resolver.

    Returns:
        A list of uppercase prefix strings (e.g. ``["BLOOD", "CELL"]``).
    """
    from .models import EntityType

    return list(EntityType.objects.values_list("prefix", flat=True))


def get_workspace_map() -> dict[str, str]:
    """Return a mapping of entity prefix → workspace_id.

    Called via the service registry (``lims.getWorkspaceMap``) from the
    core mentions prefix resolver.

    Returns:
        A dict mapping uppercase prefix strings to workspace IDs.
    """
    from .models import RegisteredEntityType

    return dict(
        RegisteredEntityType.objects.values_list("prefix", "workspace_id")
    )
