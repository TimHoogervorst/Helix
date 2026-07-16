"""Signal handlers for the LIMS mod.

These handlers invert the dependency between ELN and LIMS: instead of
ELN reaching into LIMS on save, LIMS listens for ELN events and updates
its own data.
"""


def sync_entities_on_content_sync(sender, entry, content, **kwargs):
    """Sync Entity rows for *entry* from limsTable nodes in *content*.

    Connected to the ``entry_content_sync`` signal (defined in
    ``core.signals``).  Returns the (possibly modified) content dict
    with entity IDs patched into limsTable rows.
    """
    # Lazy import to avoid triggering model registry at import time.
    from core_mods.lims.services import sync_entities

    return sync_entities(entry, content)
