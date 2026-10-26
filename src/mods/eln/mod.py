from django.urls import include, path

from helix_core.public import (
    AggregateMeta,
    ColumnType,
    OperatorMeta,
    SignalKind,
    public_column_type_registry as column_type_registry,
)


def validate_review_anchor(*, anchor, manifest):
    """Validate annotation coordinates against the retained TipTap document."""
    if anchor.get("group_key") != "document":
        return False
    document = manifest.get("groups", {}).get("document", {}).get("snapshot", {}).get("document")
    kind = anchor.get("kind")

    def text_content(node):
        if not isinstance(node, dict):
            return ""
        if node.get("type") == "text":
            return node.get("text", "")
        return "".join(text_content(child) for child in node.get("content", []) if isinstance(child, dict))

    if kind == "document":
        return isinstance(document, dict)
    if kind == "text":
        start, end, selected = anchor.get("from"), anchor.get("to"), anchor.get("text")
        whole_text = text_content(document)
        return isinstance(start, int) and isinstance(end, int) and 0 < start < end and isinstance(selected, str) and bool(selected.strip()) and selected in whole_text
    if kind == "block":
        path = anchor.get("block_path")
        if not isinstance(path, list) or not path:
            return False
        node = document
        try:
            for index in path:
                node = node["content"][index]
        except (KeyError, IndexError, TypeError):
            return False
        return isinstance(node, dict) and text_content(node) == anchor.get("text", text_content(node))
    return False


class TiptapContentColumnType(ColumnType):
    """Column type for TipTap rich-text content stored as JSON.

    Represents the body content of ELN entries.  The ``contains`` operator
    searches within the plain-text portion of the TipTap JSON document.
    """

    id = "tiptap_content"
    display_name = "TipTap Content"
    icon = "file-text"
    color = "flask"
    operand_shape = "text"

    def get_operators(self) -> list[OperatorMeta]:
        return [
            OperatorMeta("contains", "Contains", "text", "icontains"),
            OperatorMeta("is_empty", "Is Empty", "none", "isnull"),
        ]

    def get_aggregates(self) -> list[AggregateMeta]:
        return [
            AggregateMeta("count", "Count", "Count"),
            AggregateMeta("count_distinct", "Count Distinct", "Count"),
        ]

    def validate(self, value, **context) -> bool | str:
        """TipTap content is stored as JSON (dict/list) or string. Always
        valid at the column-type level — structural validation is handled by
        the TipTap editor."""
        if value is None or value == "":
            return True
        if isinstance(value, (str, dict, list)):
            return True
        return f"Expected TipTap JSON (dict, list, or string), got {type(value).__name__}"


def register(mod):
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from mods.eln.cascade import update_status_from_source
    from mods.eln.models import NotebookEntry
    from mods.eln.renditions import PRESENTATION_VERSION, capture_external_evidence, render_review_manifest
    from mods.eln.serializers import NotebookEntrySerializer
    from mods.eln.views import NotebookEntryViewSet
    from helix_core.public import visible_rows_q

    # Register the tiptap_content column type so consumers (entity hub,
    # registry table) can discover and render it generically.
    mod.register_column_type(TiptapContentColumnType())

    entry = mod.register_model("entry", NotebookEntry)
    mod.register_revision_group(
        "document",
        entry,
        # Keep the historical target label written into Actions and group
        # rows while canonical ownership comes from this Mod registration.
        target_model_reference="eln.entry",
        action_identities={
            "created": "eln.entry.created",
            "edited": "eln.entry.edited",
        },
    )
    mod.register_review_target(
        "review-target",
        entry,
        revision_groups=["document"],
        renderer=render_review_manifest,
        renderer_version=PRESENTATION_VERSION,
        evidence_capture=capture_external_evidence,
        annotation_capabilities=["narrative-text", "whole-block", "document"],
        anchor_validator=validate_review_anchor,
        operation_effects={"edit_entry": ["document"]},
    )
    mod.register_source_kind(
        "entry",
        entry,
        visibility_query=lambda request, queryset: queryset.filter(
            visible_rows_q(request.user)
        ),
        serializer=NotebookEntrySerializer,
        hub_visible=True,
        display_metadata={
            "label": "ELN Entry",
            "workspace_id": "eln",
            "icon": "notebook",
            "color": "flask",
        },
        mutation_handlers={
            "create": NotebookEntryViewSet.perform_create,
            "edit": NotebookEntryViewSet.perform_update,
            "lock": NotebookEntryViewSet._acquire_lock,
        },
    )

    # ── Entry-level custom actions ───────────────────────────────────────
    # Actions used by @logs_action decorators in views.py.  Must be
    # registered before the views are imported.
    mod.register_custom_action("eln.entry.tags_attached", "Tags Attached", "edited", entry)
    mod.register_custom_action("eln.entry.tag_detached", "Tag Detached", "edited", entry)

    # ── Block-level custom actions ───────────────────────────────────────
    # Per docs/actions-system-design.md the backend catalog is the single
    # source of truth — sync from the frontend is a convenience, not a
    # prerequisite.  Registering every block action here ensures the
    # catalog is always available, even after a server restart without a
    # browser reload.
    block_actions = [
        # Registry-table custom actions (declared via emits in index.ts)
        ("eln.registry-table.entities-registered", "Entities Registered", "edited"),
        ("eln.registry-table.row-added", "Row Added", "edited"),
        # Cross-mod action used by LIMS EntityViewSet.batch_register
        ("eln.entities.registered", "Entities Registered", "edited"),
        # Block lifecycle actions — auto-derived for every block type
        ("eln.table.created", "Table Created", "created"),
        ("eln.table.edited", "Table Edited", "edited"),
        ("eln.table.deleted", "Table Deleted", "deleted"),
        ("eln.comment.created", "Comment Created", "created"),
        ("eln.comment.edited", "Comment Edited", "edited"),
        ("eln.comment.deleted", "Comment Deleted", "deleted"),
        ("eln.protocol.created", "Protocol Created", "created"),
        ("eln.protocol.edited", "Protocol Edited", "edited"),
        ("eln.protocol.deleted", "Protocol Deleted", "deleted"),
        ("eln.registry-table.created", "Registry Table Created", "created"),
        ("eln.registry-table.edited", "Registry Table Edited", "edited"),
        ("eln.registry-table.deleted", "Registry Table Deleted", "deleted"),
    ]
    # The editor emits lifecycle IDs from the owning block's canonical ID,
    # even when a LIMS block is hosted inside an ELN entry. Keep the legacy
    # declarations above for older clients and retained activity records.
    for block_id, label in (
        ("helix.eln:table", "Table"),
        ("helix.lims:comment", "Comment"),
        ("helix.lims:protocol", "Protocol"),
        ("helix.lims:registry-table", "Registry Table"),
        ("helix.lims:result-table", "Result Table"),
    ):
        for verb in ("created", "edited", "deleted"):
            block_actions.append((f"{block_id}.{verb}", f"{label} {verb.title()}", verb))
    block_actions.extend([
        ("helix.lims:registry-table.entities-registered", "Entities Registered", "edited"),
        ("helix.lims:registry-table.row-added", "Row Added", "edited"),
        ("helix.lims:result-table.results-registered", "Results Registered", "edited"),
    ])
    for action_id, label, core in block_actions:
        mod.register_custom_action(action_id, label, core, entry)

    mod.register_schema_type(
        display_name="ELN Entry",
        workspace_id="eln",
        model=entry,
        prefix="E",
        icon="notebook",
        color="flask",
    )
    mod.register_signal(SignalKind.MODEL_POST_SAVE, entry, update_status_from_source)
    mod.register_urls([path("api/eln/", include("mods.eln.urls"))])
