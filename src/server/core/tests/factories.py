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
