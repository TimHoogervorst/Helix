"""
Service functions for inline reference resolution and mention sync.

PREFIX_MAP maps display_id letter prefixes to Django models.
"""
from django.contrib.contenttypes.models import ContentType

from eln.models import NotebookEntry

#: Map display_id prefix letter to the model it identifies.
PREFIX_MAP = {
    "E": NotebookEntry,
}

#: Map model class to the short type string used in API responses.
MODEL_TYPE_MAP = {
    NotebookEntry: "entry",
}


def resolve_display_id(display_id: str):
    """
    Resolve a display_id like "E1" to a model instance.

    Returns (instance, content_type) or None if unresolvable.
    """
    # Extract the prefix (leading letters) from the display_id.
    prefix = ""
    for char in display_id:
        if char.isalpha():
            prefix += char
        else:
            break

    if not prefix:
        return None

    model = PREFIX_MAP.get(prefix.upper())
    if model is None:
        return None

    # Query the model by display_id. Only NotebookEntry has display_id for now.
    try:
        instance = model.objects.get(display_id=display_id)
    except model.DoesNotExist:
        return None

    ct = ContentType.objects.get_for_model(model)
    return instance, ct


def walk_reference_nodes(node):
    """
    Recursively yield all ``displayId`` values from reference nodes in a TipTap JSON tree.
    """
    if not isinstance(node, dict):
        return

    if node.get("type") == "reference":
        attrs = node.get("attrs", {})
        display_id = attrs.get("displayId")
        if display_id:
            yield display_id
        return  # reference nodes are atomic — no children to recurse into

    # Recurse into any "content" arrays
    for key, value in node.items():
        if key == "content" and isinstance(value, list):
            for child in value:
                yield from walk_reference_nodes(child)
        elif isinstance(value, dict):
            yield from walk_reference_nodes(value)
        elif isinstance(value, list):
            for item in value:
                yield from walk_reference_nodes(item)


def sync_mentions(source, tiptap_json):
    """
    Sync the Mention rows for *source* to match the reference nodes in *tiptap_json*.

    1. Walk the TipTap JSON to collect all ``displayId`` values.
    2. Resolve each displayId via PREFIX_MAP.
    3. Diff against existing Mention rows for this source.
    4. Create new mentions, delete removed ones.
    """
    from eln.models import Mention

    # Collect resolved target references from the document
    resolved_targets = set()
    for display_id in walk_reference_nodes(tiptap_json):
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
