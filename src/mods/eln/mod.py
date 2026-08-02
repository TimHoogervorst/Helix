from django.urls import include, path

from helix_core.column_types import ColumnType, OperatorMeta, registry as column_type_registry
from helix_core.mod_system.registry import registry


class TiptapContentColumnType(ColumnType):
    """Column type for TipTap rich-text content stored as JSON.

    Represents the body content of ELN entries.  The ``contains`` operator
    searches within the plain-text portion of the TipTap JSON document.
    """

    id = "tiptap_content"
    display_name = "TipTap Content"
    icon = "file-text"
    operand_shape = "text"

    def get_operators(self) -> list[OperatorMeta]:
        return [
            OperatorMeta("contains", "Contains", "text", "icontains"),
            OperatorMeta("is_empty", "Is Empty", "none", "isnull"),
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


def register():
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from django.db.models.signals import post_save

    from mods.eln.cascade import update_entity_status_from_entry
    from mods.eln.models import ElnAction, NotebookEntry

    # Register the tiptap_content column type so consumers (entity hub,
    # registry table) can discover and render it generically.
    column_type_registry.register_column_type(TiptapContentColumnType())

    registry.register_action_model("eln", ElnAction)

    # ── Entry-level custom actions ───────────────────────────────────────
    # Actions used by @logs_action decorators in views.py.  Must be
    # registered before the views are imported.
    registry.register_custom_action(
        mod_id="eln",
        action_id="eln.entry.tags_attached",
        label="Tags Attached",
        core="edited",
        target_model="mods.eln.models.NotebookEntry",
    )
    registry.register_custom_action(
        mod_id="eln",
        action_id="eln.entry.tag_detached",
        label="Tag Detached",
        core="edited",
        target_model="mods.eln.models.NotebookEntry",
    )

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
    for action_id, label, core in block_actions:
        registry.register_custom_action(
            mod_id="eln",
            action_id=action_id,
            label=label,
            core=core,
            target_model="mods.eln.models.NotebookEntry",
        )

    registry.register_schema_type(
        display_name="ELN Entry",
        workspace_id="eln",
        model="mods.eln.models.NotebookEntry",
        prefix="E",
    )
    registry.register_signal(
        "eln", post_save, update_entity_status_from_entry, sender=NotebookEntry
    )
    registry.register_urls(
        "eln", [path("api/eln/", include("mods.eln.urls"))]
    )
