"""Signal handlers for the LIMS mod.

These handlers invert the dependency between ELN and LIMS: instead of
ELN reaching into LIMS on save, LIMS listens for ELN events and updates
its own data.
"""


def update_entity_status_from_entry(sender, instance, created, **kwargs):
    """Propagate NotebookEntry status changes to linked Entity rows.

    Connected to Django's ``post_save`` signal for ``NotebookEntry``.
    When an existing entry (not a new one) is saved with a changed
    status, all Entity rows linked via ``source_entry`` are updated to
    match.
    """
    if created:
        return
    # Lazy import to avoid triggering model registry at import time.
    from core_mods.lims.models import Entity

    Entity.objects.filter(source_entry=instance).update(status=instance.status)


def sync_entities_on_content_sync(sender, entry, content, **kwargs):
    """Sync Entity rows for *entry* from limsTable nodes in *content*.

    Connected to the ``entry_content_sync`` signal (defined in
    ``core.signals``).  Returns the (possibly modified) content dict
    with entity IDs patched into limsTable rows.
    """
    # Lazy import to avoid triggering model registry at import time.
    from core_mods.lims.services import sync_entities

    return sync_entities(entry, content)
