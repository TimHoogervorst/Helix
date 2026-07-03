"""
Content sync pipeline for notebook entries.

The single public export ``sync_entry_content`` owns the full pipeline:
entities first (so newly created display IDs are resolvable), then
mentions, then conditional save.

Adding a third sync step (e.g. Protocol widgets) changes this file alone
— the view layer stays one call.
"""
from core_mods.lims.services import sync_entities
from references.services import sync_mentions

from .models import NotebookEntry


def sync_entry_content(entry: NotebookEntry) -> NotebookEntry:
    """
    Sync all derived content for *entry*.

    Pipeline (ordering matters):

    1. ``sync_entities`` — walks TipTap JSON for limsTable nodes, creates/
       updates/deletes Entity rows, patches entity IDs into attrs.rows.
    2. ``sync_mentions`` — walks the (possibly patched) JSON for reference
       nodes, creates/deletes Mention rows.

    Entities sync first because newly created entity display IDs may be
    referenced from other parts of the same document (via reference nodes
    in table cells or inline text).

    Saves the entry if content changed (entity IDs patched in).  Returns
    the (possibly updated) entry.
    """
    content = sync_entities(entry, entry.content)
    sync_mentions(entry, content)

    if content != entry.content:
        entry.content = content
        entry.save(update_fields=["content"])

    return entry
