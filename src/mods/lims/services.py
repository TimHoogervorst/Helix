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
    """Return all entity prefix strings from Schema and EntityType.

    Called via the service registry (``lims.getEntityPrefixes``) from the
    core mentions prefix resolver.

    Returns:
        A list of uppercase prefix strings (e.g. ``["BLOOD", "CELL"]``).
    """
    from helix_core.models import Schema

    from .models import EntityType

    # Only include LIMS-owned Schema prefixes — filter out prefixes from
    # other mods (e.g. ELN entries) to avoid collisions in the prefix map.
    schema_prefixes = list(
        Schema.objects.filter(
            schema_type__model__startswith="mods.lims"
        ).values_list("prefix", flat=True)
    )
    entity_type_prefixes = list(EntityType.objects.values_list("prefix", flat=True))
    # Deduplicate in case the same prefix exists in both tables.
    return list(set(schema_prefixes + entity_type_prefixes))


def get_workspace_map() -> dict[str, str]:
    """Return a mapping of entity prefix → workspace_id.

    Called via the service registry (``lims.getWorkspaceMap``) from the
    core mentions prefix resolver.

    Combines mappings from both ``RegisteredEntityType`` and the new
    ``Schema`` / ``SchemaType`` models.

    Returns:
        A dict mapping uppercase prefix strings to workspace IDs.
    """
    from helix_core.models import Schema

    from .models import RegisteredEntityType

    result = dict(
        RegisteredEntityType.objects.values_list("prefix", "workspace_id")
    )
    # Also include Schema-based workspace mappings.
    for schema in Schema.objects.select_related("schema_type"):
        result[schema.prefix] = schema.schema_type.workspace_id
    return result
