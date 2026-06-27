"""
Service functions for inline reference resolution and mention sync.

PREFIX_MAP maps display_id letter prefixes to Django models.
Entity prefixes are loaded dynamically from the LIMS EntityType table.
"""
from django.contrib.contenttypes.models import ContentType

from core.walker import walk_tiptap_tree

from eln.models import NotebookEntry


def _get_entity_model():
    """Lazy-import to avoid circular imports at module level."""
    from lims.models import Entity
    return Entity


#: Map display_id prefix letter to the model it identifies.
#: Static entries are defined here; entity prefixes are loaded dynamically.
PREFIX_MAP = {
    "E": NotebookEntry,
}


#: Map model class to the short type string used in API responses.
MODEL_TYPE_MAP = {
    NotebookEntry: "entry",
}


def _get_dynamic_prefix_map():
    """
    Build a prefix→model map that includes both static prefixes and
    dynamically loaded entity prefixes from the database.
    """
    pmap = dict(PREFIX_MAP)

    # Dynamically load entity prefixes
    try:
        from lims.models import EntityType
        # Use cached/simple query — no need for select_related
        for et in EntityType.objects.values_list("prefix", flat=True):
            pmap[et] = _get_entity_model()
    except Exception:
        # App may not be ready during initial migration — ignore
        pass

    return pmap


def _get_dynamic_model_type_map():
    """Include entity model in the type map."""
    mmap = dict(MODEL_TYPE_MAP)
    try:
        Entity = _get_entity_model()
        mmap[Entity] = "entity"
    except Exception:
        pass
    return mmap


def resolve_display_id(display_id: str):
    """
    Resolve a display_id like "E1" or "BLOOD1" to a model instance.

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

    pmap = _get_dynamic_prefix_map()
    model = pmap.get(prefix.upper())
    if model is None:
        return None

    try:
        instance = model.objects.get(display_id=display_id)
    except model.DoesNotExist:
        return None

    ct = ContentType.objects.get_for_model(model)
    return instance, ct


def _get_icon(instance, model_type: str) -> str:
    """
    Return the emoji icon for a resolved reference.

    - ELN entries: hardcoded ``"📄"``
    - LIMS entities: the entity type's configured icon, or ``"🧪"`` if none set
    """
    if model_type == "entry":
        return "📄"
    # Entity
    try:
        entity_type = instance.entity_type
        if entity_type and getattr(entity_type, "icon", None):
            return entity_type.icon
    except AttributeError:
        pass
    return "🧪"


def walk_reference_nodes(node):
    """
    Return all ``displayId`` values from reference nodes in a TipTap JSON tree.

    Delegates traversal to ``core.walker.walk_tiptap_tree``; the domain
    logic (which ProseMirror node types carry reference data) stays here.

    Handles two formats:

    1. **Inline reference nodes** — ``{type: "reference", attrs: {displayId: "..."}}``
       found in paragraph text (both inline and inside table cells).

    2. **LimsTable v2 JSON rows** — ``{type: "limsTable", attrs: {columns: [...], rows: [
       {values: {colName: "BLOOD1"}}]}}`` where Reference-type column values
       are stored as plain display_id strings.
    """
    found_ids = []

    def discover(n):
        if n.get("type") == "reference":
            display_id = n.get("attrs", {}).get("displayId")
            if display_id:
                found_ids.append(display_id)
            return None

        if n.get("type") == "limsTable":
            attrs = n.get("attrs", {})
            columns = attrs.get("columns", [])
            ref_col_names = {
                c["name"] for c in columns
                if isinstance(c, dict) and c.get("type") == "Reference"
            }
            if ref_col_names:
                for row in attrs.get("rows", []):
                    if not isinstance(row, dict):
                        continue
                    values = row.get("values", {})
                    for col_name in ref_col_names:
                        val = values.get(col_name)
                        if isinstance(val, str) and val.strip():
                            found_ids.append(val)
            return None

        return None

    walk_tiptap_tree(node, discover)
    return found_ids


def sync_mentions(source, tiptap_json):
    """
    Sync the Mention rows for *source* to match the reference nodes in *tiptap_json*.

    1. Walk the TipTap JSON to collect all ``displayId`` values.
    2. Resolve each displayId via PREFIX_MAP (including dynamic entity prefixes).
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
