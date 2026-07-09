"""
Tests for ``core.mentions.node_walker.collect_reference_ids``.
"""
from django.test import SimpleTestCase

from core.mentions.node_walker import collect_reference_ids


# ── Reusable (immutable) document fixtures ──────────────────────────────

EMPTY_DOC = {"type": "doc", "content": [{"type": "paragraph"}]}

SINGLE_REF_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "See "},
                {"type": "reference", "attrs": {"displayId": "E1"}},
                {"type": "text", "text": " for details."},
            ],
        }
    ],
}

MULTI_REF_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [
                {"type": "reference", "attrs": {"displayId": "E1"}},
                {"type": "text", "text": " and "},
                {"type": "reference", "attrs": {"displayId": "E2"}},
            ],
        }
    ],
}

NESTED_REF_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "blockquote",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "reference", "attrs": {"displayId": "E3"}},
                    ],
                }
            ],
        }
    ],
}

REF_IN_TABLE_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "table",
            "content": [
                {
                    "type": "tableRow",
                    "content": [
                        {
                            "type": "tableCell",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [
                                        {"type": "reference",
                                         "attrs": {"displayId": "E5"}},
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ],
        }
    ],
}

LIMSTABLE_REF_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "limsTable",
            "attrs": {
                "schemaId": 1,
                "title": "Blood Samples",
                "columns": [
                    {"name": "patient", "type": "string"},
                    {"name": "sample", "type": "Reference"},
                ],
                "rows": [
                    {
                        "entityId": None,
                        "displayId": "#new",
                        "values": {"patient": "Alice", "sample": "BLOOD1"},
                    },
                    {
                        "entityId": None,
                        "displayId": "#new",
                        "values": {"patient": "Bob", "sample": "BLOOD2"},
                    },
                ],
            },
        }
    ],
}

LIMSTABLE_NO_REF_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "limsTable",
            "attrs": {
                "schemaId": 1,
                "title": "No Refs",
                "columns": [
                    {"name": "patient", "type": "string"},
                    {"name": "volume", "type": "number"},
                ],
                "rows": [
                    {
                        "entityId": None,
                        "displayId": "#new",
                        "values": {"patient": "Alice", "volume": "50"},
                    },
                ],
            },
        }
    ],
}

MISSING_ATTRS_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [
                {"type": "reference"},
            ],
        }
    ],
}

MISSING_DISPLAYID_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [
                {"type": "reference", "attrs": {}},
            ],
        }
    ],
}

DUPLICATE_REF_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [
                {"type": "reference", "attrs": {"displayId": "E1"}},
                {"type": "text", "text": " "},
                {"type": "reference", "attrs": {"displayId": "E1"}},
                {"type": "text", "text": " "},
                {"type": "reference", "attrs": {"displayId": "E1"}},
            ],
        }
    ],
}

MIXED_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "Inline: "},
                {"type": "reference", "attrs": {"displayId": "E10"}},
            ],
        },
        {
            "type": "limsTable",
            "attrs": {
                "schemaId": 1,
                "title": "Samples",
                "columns": [
                    {"name": "name", "type": "string"},
                    {"name": "entity", "type": "Reference"},
                ],
                "rows": [
                    {
                        "entityId": None,
                        "displayId": "#new",
                        "values": {"name": "A", "entity": "BLOOD3"},
                    },
                ],
            },
        },
    ],
}


class CollectReferenceIdsTests(SimpleTestCase):
    """collect_reference_ids() tests — pure function, no database setup."""

    def test_empty_doc_returns_empty_list(self):
        """A doc with no references returns an empty list."""
        self.assertEqual(collect_reference_ids(EMPTY_DOC), [])

    def test_single_inline_reference(self):
        """A single reference node is discovered."""
        self.assertEqual(collect_reference_ids(SINGLE_REF_DOC), ["E1"])

    def test_multiple_inline_references(self):
        """Multiple reference nodes in one paragraph are all found."""
        self.assertEqual(collect_reference_ids(MULTI_REF_DOC), ["E1", "E2"])

    def test_nested_reference_in_blockquote(self):
        """A reference inside a blockquote is found (recursive traversal)."""
        self.assertEqual(collect_reference_ids(NESTED_REF_DOC), ["E3"])

    def test_reference_inside_table_cell(self):
        """A reference inside a table cell is found."""
        self.assertEqual(collect_reference_ids(REF_IN_TABLE_DOC), ["E5"])

    def test_lims_table_reference_columns(self):
        """LimsTable Reference-type column values are collected."""
        self.assertEqual(
            collect_reference_ids(LIMSTABLE_REF_DOC), ["BLOOD1", "BLOOD2"]
        )

    def test_lims_table_without_reference_columns(self):
        """A LimsTable with no Reference columns returns empty list."""
        self.assertEqual(collect_reference_ids(LIMSTABLE_NO_REF_DOC), [])

    def test_missing_attrs_on_reference_node(self):
        """A reference node with no attrs dict is handled gracefully."""
        self.assertEqual(collect_reference_ids(MISSING_ATTRS_DOC), [])

    def test_missing_display_id_in_attrs(self):
        """A reference node with attrs but no displayId is handled."""
        self.assertEqual(collect_reference_ids(MISSING_DISPLAYID_DOC), [])

    def test_duplicates_are_deduplicated(self):
        """The same display ID appearing multiple times is returned once."""
        self.assertEqual(collect_reference_ids(DUPLICATE_REF_DOC), ["E1"])

    def test_mixed_inline_and_lims_table(self):
        """A doc with both inline refs and LimsTable refs finds both."""
        self.assertEqual(
            collect_reference_ids(MIXED_DOC), ["E10", "BLOOD3"]
        )
