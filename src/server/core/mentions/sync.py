"""
Mention reconciliation — sync the Mention table to match reference nodes
in a TipTap JSON document.

Orchestrates ``node_walker.collect_reference_ids`` and
``prefix_resolver.resolve_display_id``, then diffs against existing
``Mention`` rows for the source object.
"""
from django.contrib.contenttypes.models import ContentType

from core.mentions.node_walker import collect_reference_ids
from core.mentions.prefix_resolver import resolve_display_id
from core.mentions.models import Mention


def sync_mentions(source, tiptap_json: dict) -> None:
    """
    Sync the Mention rows for *source* to match the reference nodes in
    *tiptap_json*.

    1. Walk the TipTap JSON to collect all ``displayId`` values.
    2. Resolve each displayId via the prefix resolver.
    3. Diff against existing Mention rows for this source.
    4. Create new mentions, delete removed ones.
    """
    # Collect resolved target references from the document
    resolved_targets = set()
    for display_id in collect_reference_ids(tiptap_json):
        result = resolve_display_id(display_id)
        if result is not None:
            target_instance, target_ct = result
            resolved_targets.add((target_ct.id, target_instance.pk))

    source_ct = ContentType.objects.get_for_model(source)

    # Existing mentions for this source
    existing = Mention.objects.filter(
        source_type=source_ct,
        source_id=source.pk,
    )
    existing_set = set(
        (m.target_type_id, m.target_id) for m in existing
    )

    # Create new mentions
    for target_ct_id, target_pk in resolved_targets - existing_set:
        Mention.objects.create(
            source_type=source_ct,
            source_id=source.pk,
            target_type_id=target_ct_id,
            target_id=target_pk,
        )

    # Delete removed mentions
    for target_ct_id, target_pk in existing_set - resolved_targets:
        Mention.objects.filter(
            source_type=source_ct,
            source_id=source.pk,
            target_type_id=target_ct_id,
            target_id=target_pk,
        ).delete()
