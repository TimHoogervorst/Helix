"""
Content sync pipeline for notebook entries.

The single public export ``sync_entry_content`` owns the full pipeline:
mention sync, then conditional save.

Adding a new sync step (e.g. Protocol widgets) changes this file alone
— the view layer stays one call.
"""
from core.signals import entry_content_sync
from core.mentions.node_walker import collect_reference_ids
from core.mentions.sync import sync_mentions

from .models import NotebookEntry


def _fingerprints_changed(old_content: dict, new_content: dict) -> bool:
    """Return True if the reference fingerprint changed.

    Compares reference display IDs extracted from *old_content* and
    *new_content*.  If unchanged the expensive sync pipeline can be skipped.
    """
    if frozenset(collect_reference_ids(old_content)) != frozenset(collect_reference_ids(new_content)):
        return True
    return False


def sync_entry_content(
    entry: NotebookEntry,
    old_content: dict | None = None,
) -> NotebookEntry:
    """
    Sync all derived content for *entry*.

    Pipeline (ordering matters):

    1. Fingerprint pre-check — if *old_content* is provided and the
       reference fingerprint didn't change vs the current content, skip
       the expensive signal dispatch and mention sync entirely.
       Text-only auto-saves are just a ContentVersion insert +
       entry.content pointer update.
    2. ``entry_content_sync`` signal — extension point for mods to hook
       into the sync pipeline (e.g. entity sync, protocol widgets).
    3. ``sync_mentions`` — walks the (possibly patched) JSON for reference
       nodes, creates/deletes Mention rows.

    Saves the entry if content changed.  Returns the (possibly updated) entry.
    """
    content = entry.content

    # ── Fingerprint pre-check ───────────────────────────────────────────
    if old_content is not None and not _fingerprints_changed(old_content, content):
        # Text-only edit — skip expensive sync pipeline entirely.
        return entry

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
