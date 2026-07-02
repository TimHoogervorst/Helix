"""
Shared TipTap document factories for backend tests.

This module exports canonical document fixtures so that every test file
doesn't need its own copy.  When the TipTap JSON schema evolves (new node
types, new attributes), update **this module** — every test imports from
here and picks up the change automatically.

Usage::

    from core.tests.factories import EMPTY_DOC, make_lims_table_doc, make_doc_with_ref

Do **not** copy-paste these definitions into new test files.
"""

# ── Constants ──────────────────────────────────────────────────────────────

EMPTY_DOC: dict = {"type": "doc", "content": [{"type": "paragraph"}]}


# ── LIMS table document ────────────────────────────────────────────────────


def make_lims_table_doc(
    schema_id: int,
    rows_data: list[dict] | None = None,
    entity_type: object | None = None,
    row_names: list[str] | None = None,
) -> dict:
    """Build a TipTap doc containing a single limsTable v2 node.

    Args:
        schema_id: PK of the EntityType.
        rows_data: List of dicts with column-name keys, e.g.
            ``[{"volume": "50", "patient": "Alice"}]``.
            If ``None``, an empty rows array is used.
        entity_type: Optional EntityType instance; used to populate
            ``attrs.columns``.  If omitted, columns will be empty.
        row_names: Optional list of entity names (``__name``) for each row.
            Defaults to ``"Row {i+1}"``.

    Each row in ``rows_data`` becomes
    ``{entityId: None, displayId: "#new", __name: ..., values: {...}}``.
    """
    if rows_data is None:
        rows_data = []

    # Derive columns from entity type if provided
    columns: list = []
    if entity_type is not None:
        columns = entity_type.columns

    rows = []
    for i, row in enumerate(rows_data):
        name = row_names[i] if row_names and i < len(row_names) else f"Row {i + 1}"
        rows.append({
            "entityId": None,
            "displayId": "#new",
            "__name": name,
            "values": row,
        })

    return {
        "type": "doc",
        "content": [
            {
                "type": "limsTable",
                "attrs": {
                    "schemaId": schema_id,
                    "title": "Test Table",
                    "columns": columns,
                    "rows": rows,
                },
            }
        ],
    }


# ── Reference document ─────────────────────────────────────────────────────


def make_doc_with_ref(display_id: str) -> dict:
    """Build a TipTap doc containing a reference node pointing at *display_id*."""
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "See "},
                    {"type": "reference", "attrs": {"displayId": display_id}},
                    {"type": "text", "text": " for details."},
                ],
            }
        ],
    }
