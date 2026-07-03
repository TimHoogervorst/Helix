"""
Content sync pipeline for notebook entries.

The single public export ``sync_entry_content`` owns the full pipeline:
entities first (so newly created display IDs are resolvable), then
mentions, then conditional save.

Adding a third sync step (e.g. Protocol widgets) changes this file alone
— the view layer stays one call.
"""
from core.signals import entry_content_sync
from references.services import sync_mentions

from .models import NotebookEntry


def sync_entry_content(entry: NotebookEntry) -> NotebookEntry:
    """
    Sync all derived content for *entry*.

    Pipeline (ordering matters):

    1. ``entry_content_sync`` signal — LIMS (and future mods) listen for
       this signal and return (possibly modified) content.  Entities are
       synced first because newly created entity display IDs may be
       referenced from other parts of the same document.
    2. ``sync_mentions`` — walks the (possibly patched) JSON for reference
       nodes, creates/deletes Mention rows.

    Saves the entry if content changed (entity IDs patched in).  Returns
    the (possibly updated) entry.
    """
    content = entry.content
    for _, response in entry_content_sync.send(
        sender=NotebookEntry, entry=entry, content=content
    ):
        if response is not None:
            content = response

    sync_mentions(entry, content)

    if content != entry.content:
        entry.content = content
        entry.save(update_fields=["content"])

    return entry
