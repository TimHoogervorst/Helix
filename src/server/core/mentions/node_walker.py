"""
Collect reference display IDs from a TipTap/ProseMirror JSON tree.

Zero model imports — pure tree walking.  Depends only on
``core.walker.walk_tiptap_tree`` for traversal.

Handles inline reference nodes:
``{type: "reference", attrs: {displayId: "..."}}``
"""
from core.walker import walk_tiptap_tree


def collect_reference_ids(tiptap_json: dict) -> list[str]:
    """
    Return all unique ``displayId`` values from reference nodes in a
    TipTap JSON tree, deduplicated in discovery order.
    """
    found_ids: list[str] = []

    def discover(node: dict) -> dict | None:
        if node.get("type") == "reference":
            display_id = node.get("attrs", {}).get("displayId")
            if display_id:
                found_ids.append(display_id)
            return None

        return None

    walk_tiptap_tree(tiptap_json, discover)

    # Deduplicate in discovery order
    return list(dict.fromkeys(found_ids))
