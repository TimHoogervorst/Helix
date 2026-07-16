"""
Content sync pipeline for notebook entries.

The single public export ``sync_entry_content`` owns the full pipeline:
entities first (so newly created display IDs are resolvable), then
mentions, then conditional save.

Adding a third sync step (e.g. Protocol widgets) changes this file alone
— the view layer stays one call.
"""
from core.signals import entry_content_sync
from core.walker import walk_tiptap_tree
from core.mentions.node_walker import collect_reference_ids
from core.mentions.sync import sync_mentions

from .models import NotebookEntry


def _collect_lims_table_fingerprint(content: dict) -> frozenset:
    """Walk a TipTap JSON tree and collect a fingerprint of every limsTable node.

    Each entry in the returned frozenset is ``(schema_id, frozenset of row
    fingerprints)``.  A row fingerprint is a 4-tuple of
    ``(entityId, displayId, __name, values_as_sorted_tuple)`` — the same
    data that ``sync_entities`` operates on.

    Plain tables (no ``schemaId``) are skipped, matching ``sync_entities``
    behaviour.  This is a pure tree walk — no DB queries.
    """
    fingerprints: list[tuple] = []

    def collect(node: dict) -> None:
        if node.get("type") != "limsTable":
            return None

        attrs = node.get("attrs", {})
        schema_id = attrs.get("schemaId")
        if schema_id is None:
            return None  # plain table — skip, matching sync_entities

        rows = attrs.get("rows", [])
        row_fps: list[tuple] = []
        for row in rows:
            if not isinstance(row, dict):
                continue

            values = row.get("values", {})
            if isinstance(values, dict):
                values_tuple = tuple(sorted(values.items()))
            else:
                values_tuple = (str(values),)

            row_fp = (
                row.get("entityId"),
                row.get("displayId"),
                row.get("__name"),
                values_tuple,
            )
            row_fps.append(row_fp)

        fingerprints.append((schema_id, frozenset(row_fps)))
        return None

    walk_tiptap_tree(content, collect)
    return frozenset(fingerprints)


def _fingerprints_changed(old_content: dict, new_content: dict) -> bool:
    """Return True if either the limsTable or reference fingerprint changed.

    Compares two fingerprints extracted from *old_content* and *new_content*:
    limsTable rows (grouped by schema) and reference display IDs.  If
    neither changed the expensive sync pipeline can be skipped.
    """
    if _collect_lims_table_fingerprint(old_content) != _collect_lims_table_fingerprint(new_content):
        return True
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

    1. Fingerprint pre-check — if *old_content* is provided and neither the
       limsTable fingerprint nor the reference fingerprint changed vs the
       current content, skip the expensive signal dispatch and mention sync
       entirely.  Text-only auto-saves are just a ContentVersion insert +
       entry.content pointer update.
    2. ``entry_content_sync`` signal — LIMS (and future mods) listen for
       this signal and return (possibly modified) content.  Entities are
       synced first because newly created entity display IDs may be
       referenced from other parts of the same document.
    3. ``sync_mentions`` — walks the (possibly patched) JSON for reference
       nodes, creates/deletes Mention rows.

    Saves the entry if content changed (entity IDs patched in).  Returns
    the (possibly updated) entry.
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
