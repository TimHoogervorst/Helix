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
