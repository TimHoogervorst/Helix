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
