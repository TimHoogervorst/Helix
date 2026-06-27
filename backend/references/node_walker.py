"""
Collect reference display IDs from a TipTap/ProseMirror JSON tree.

Zero model imports — pure tree walking.  Depends only on
``core.walker.walk_tiptap_tree`` for traversal.

Handles two reference formats:

1. **Inline reference nodes** — ``{type: "reference", attrs: {displayId: "..."}}``
2. **LimsTable v2 JSON rows** — ``{type: "limsTable", attrs: {columns: [...],
   rows: [{values: {colName: "BLOOD1"}}]}}`` where Reference-type column
   values are stored as plain display_id strings.
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

        if node.get("type") == "limsTable":
            attrs = node.get("attrs", {})
            columns = attrs.get("columns", [])
            ref_col_names = {
                c["name"]
                for c in columns
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

    walk_tiptap_tree(tiptap_json, discover)

    # Deduplicate in discovery order
    return list(dict.fromkeys(found_ids))
