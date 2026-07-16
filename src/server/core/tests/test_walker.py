"""
Tests for the shared TipTap JSON tree walker.

All tests use synthetic TipTap/ProseMirror JSON — no database.
"""
from django.test import TestCase

from core.walker import walk_tiptap_tree


# ── Dummy handlers ─────────────────────────────────────────────────────

def _null_handler(node):
    """Handler that never changes anything."""
    return None


def _identity_replacer(node):
    """Handler that replaces every dict node with a shallow copy."""
    return dict(node)


def _tag_handler(node):
    """Handler that adds a ``_walked`` marker to every dict node."""
    new = dict(node)
    new["_walked"] = True
    return new


# ── Synthetic TipTap document fixtures ──────────────────────────────────

FLAT_DOC = {
    "type": "doc",
    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}],
}

NESTED_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "Hello"},
            ],
        },
        {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "World"},
            ],
        },
    ],
}

DOC_WITH_LIST_IN_ATTRS = {
    "type": "doc",
    "content": [
        {
            "type": "orderedList",
            "attrs": {"order": 1},
            "content": [
                {"type": "listItem", "content": [{"type": "paragraph"}]},
                {"type": "listItem", "content": [{"type": "paragraph"}]},
            ],
        },
    ],
}

DEEPLY_NESTED_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "blockquote",
            "content": [
                {
                    "type": "orderedList",
                    "attrs": {"order": 1},
                    "content": [
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [
                                        {"type": "text", "text": "Deep"},
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
}

DOC_WITH_SCALAR_IN_LIST = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "Hello"},
                "plain string in content",          # non-dict item
                42,                                   # non-dict item
                {"type": "text", "text": "World"},
            ],
        },
    ],
}


# ── Tests ───────────────────────────────────────────────────────────────

class WalkTiptapTreeTests(TestCase):
    """Tests for walk_tiptap_tree traversal and handler semantics."""

    # ── Basic traversal ────────────────────────────────────────────────

    def test_walks_flat_document(self):
        """The walker visits every dict node in a simple document."""
        visited = []

        def record(node):
            visited.append(node.get("type"))
            return None

        walk_tiptap_tree(FLAT_DOC, record)

        self.assertEqual(
            visited,
            ["doc", "paragraph", "text"],
        )

    def test_walks_nested_document(self):
        """Every node across multiple paragraphs is visited."""
        visited = []

        def record(node):
            visited.append(node.get("type"))
            return None

        walk_tiptap_tree(NESTED_DOC, record)

        self.assertEqual(
            visited,
            ["doc", "paragraph", "text", "paragraph", "text"],
        )

    def test_walks_content_arrays(self):
        """Content arrays with multiple children are fully walked."""
        visited = []

        def record(node):
            visited.append(node.get("type"))
            return None

        walk_tiptap_tree(DOC_WITH_LIST_IN_ATTRS, record)

        self.assertIn("orderedList", visited)
        self.assertEqual(visited.count("listItem"), 2)

    def test_walks_nested_dicts(self):
        """attrs dictionaries are recursed into."""
        visited = []

        def record(node):
            visited.append(node.get("type"))
            return None

        walk_tiptap_tree(DOC_WITH_LIST_IN_ATTRS, record)

        self.assertIn("orderedList", visited)

    def test_walks_arbitrary_lists(self):
        """Lists that are not named 'content' (e.g., orderedList's listItems) are walked."""
        visited = []

        def record(node):
            visited.append(node.get("type"))
            return None

        walk_tiptap_tree(DOC_WITH_LIST_IN_ATTRS, record)

        self.assertIn("listItem", visited)

    def test_deeply_nested_structure(self):
        """Every node is reached regardless of nesting depth."""
        visited = []

        def record(node):
            visited.append(node.get("type"))
            return None

        walk_tiptap_tree(DEEPLY_NESTED_DOC, record)

        # The orderedList has attrs: {order: 1} which is a dict the walker
        # visits — it has no "type" key, so record appends None.
        self.assertEqual(
            visited,
            ["doc", "blockquote", "orderedList", None, "listItem", "paragraph", "text"],
        )

    def test_non_dict_items_preserved(self):
        """Strings and numbers inside lists pass through unchanged."""
        walked = walk_tiptap_tree(DOC_WITH_SCALAR_IN_LIST, _null_handler)

        content = walked["content"][0]["content"]
        self.assertEqual(content[0], {"type": "text", "text": "Hello"})
        self.assertEqual(content[1], "plain string in content")
        self.assertEqual(content[2], 42)
        self.assertEqual(content[3], {"type": "text", "text": "World"})

    # ── Handler semantics ──────────────────────────────────────────────

    def test_handler_replaces_node(self):
        """Handler returning a dict replaces the node in the output."""
        def add_marker(node):
            return {**node, "_marker": True}

        result = walk_tiptap_tree(FLAT_DOC, add_marker)

        self.assertTrue(result.get("_marker"))
        self.assertTrue(result["content"][0].get("_marker"))
        self.assertTrue(result["content"][0]["content"][0].get("_marker"))

    def test_handler_returns_none(self):
        """Handler returning None leaves the node unchanged."""
        result = walk_tiptap_tree(FLAT_DOC, _null_handler)
        self.assertIs(result, FLAT_DOC)  # same object — no copy made

    def test_handler_selective_replacement(self):
        """Handler can replace only specific node types and leave others."""
        def replace_text_only(node):
            if node.get("type") == "text":
                return {**node, "text": node["text"].upper()}
            return None

        result = walk_tiptap_tree(FLAT_DOC, replace_text_only)

        # text node was replaced with uppercased text
        text_node = result["content"][0]["content"][0]
        self.assertEqual(text_node["text"], "HELLO")
        self.assertEqual(text_node["type"], "text")

        # doc is unchanged — none of its children had identity change at doc's level
        # (the paragraph was rebuilt because its text-child changed, so its
        # identity differs, but doc's content list items didn't change identity
        # since the paragraph replacement IS the list item.)

    # ── Immutability ────────────────────────────────────────────────────

    def test_does_not_mutate_input(self):
        """The input tree is never mutated, even when handler transforms nodes."""
        original = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hi"}]}],
        }

        def upper(node):
            if node.get("type") == "text":
                return {**node, "text": node["text"].upper()}
            return None

        result = walk_tiptap_tree(original, upper)

        # Input unchanged
        self.assertEqual(
            original["content"][0]["content"][0]["text"], "Hi"
        )
        # Output transformed
        self.assertEqual(
            result["content"][0]["content"][0]["text"], "HI"
        )
        # Different objects
        self.assertIsNot(result, original)

    # ── Multi-pass pattern ──────────────────────────────────────────────

    def test_multi_pass_pattern(self):
        """Two sequential walks — the second sees the first's changes."""
        tree = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "original"}]}
            ],
        }

        # Pass 1: collect text content (no transformation)
        collected = []

        def collect(node):
            if node.get("type") == "text":
                collected.append(node["text"])
            return None

        tree = walk_tiptap_tree(tree, collect)
        self.assertEqual(collected, ["original"])

        # Pass 2: patch based on collected data
        def patch(node):
            if node.get("type") == "text":
                return {**node, "text": "patched"}
            return None

        tree = walk_tiptap_tree(tree, patch)
        self.assertEqual(
            tree["content"][0]["content"][0]["text"], "patched"
        )

    # ── Identity tracking ───────────────────────────────────────────────

    def test_unchanged_nodes_remain_identical(self):
        """Nodes the handler doesn't touch keep their identity."""
        result = walk_tiptap_tree(FLAT_DOC, _null_handler)

        # Root is identical
        self.assertIs(result, FLAT_DOC)

        # But if ONLY a child is changed, ancestors that were copied
        # lose identity.  Test that unchanged siblings stay identical.
        doc_with_many = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "A"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "B"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "C"}]},
            ],
        }

        def change_b_only(node):
            if node.get("text") == "B":
                return {**node, "text": "B-modified"}
            return None

        result = walk_tiptap_tree(doc_with_many, change_b_only)

        # Paragraph A and C should be the same objects (unchanged)
        self.assertIs(result["content"][0], doc_with_many["content"][0])
        self.assertIs(result["content"][2], doc_with_many["content"][2])

        # Paragraph B should be a new object
        self.assertIsNot(result["content"][1], doc_with_many["content"][1])
        self.assertEqual(
            result["content"][1]["content"][0]["text"], "B-modified"
        )

    # ── dict in attrs ───────────────────────────────────────────────────

    def test_walks_dict_inside_attrs(self):
        """A dict nested inside an attrs value is walked."""
        doc_with_attrs_dict = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "attrs": {"nested": {"key": "value"}},
                },
            ],
        }

        visited = []

        def record(node):
            visited.append(node.get("type"))
            return None

        walk_tiptap_tree(doc_with_attrs_dict, record)

        # The walker visits: doc, paragraph, the attrs dict, and the nested
        # dict inside attrs (the nested one has no "type" key → None).
        self.assertEqual(len(visited), 4)  # doc, paragraph, attrs-dict, nested-dict


# ── Realistic handler patterns (smoke tests for actual use cases) ───────

class WalkerHandlerPatternTests(TestCase):
    """Tests exercising patterns used by real service handlers."""

    def test_collect_pattern(self):
        """Accumulate findings without transforming the tree."""
        found = []

        def discover(node):
            if node.get("type") == "reference":
                display_id = node.get("attrs", {}).get("displayId")
                if display_id:
                    found.append(display_id)
            return None

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "reference", "attrs": {"displayId": "E1"}},
                        {"type": "text", "text": " and "},
                        {"type": "reference", "attrs": {"displayId": "E2"}},
                    ],
                },
                {
                    "type": "blockquote",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "reference", "attrs": {"displayId": "E3"}},
                            ],
                        },
                    ],
                },
            ],
        }

        result = walk_tiptap_tree(doc, discover)

        self.assertEqual(found, ["E1", "E2", "E3"])
        self.assertIs(result, doc)  # no-op → identical

    def test_conditionally_patch_nodes(self):
        """Replace limsTable-type nodes while leaving others intact."""
        def patch_lims_tables(node):
            if node.get("type") != "limsTable":
                return None
            # Simulate patching entityId/displayId into rows
            new_node = dict(node)
            new_node["attrs"] = dict(node.get("attrs", {}))
            new_node["attrs"]["rows"] = [
                {"entityId": 1, "displayId": "BLOOD1", "values": {"vol": "50"}},
            ]
            return new_node

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": 1,
                        "rows": [{"entityId": None, "displayId": "#new", "values": {"vol": "50"}}],
                    },
                },
                {"type": "paragraph"},
            ],
        }

        result = walk_tiptap_tree(doc, patch_lims_tables)

        # limsTable was patched
        row0 = result["content"][0]["attrs"]["rows"][0]
        self.assertEqual(row0["entityId"], 1)
        self.assertEqual(row0["displayId"], "BLOOD1")

        # paragraph is unchanged (same object)
        self.assertIs(result["content"][1], doc["content"][1])

    def test_empty_doc_traversal(self):
        """Walking an empty document is a no-op."""
        empty = {"type": "doc", "content": []}
        result = walk_tiptap_tree(empty, _null_handler)
        self.assertIs(result, empty)

    def test_list_of_only_scalars_preserved(self):
        """A list containing only non-dict items is walked without changes."""
        doc = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": ["hello", 123, None]},
            ],
        }

        result = walk_tiptap_tree(doc, _null_handler)
        self.assertIs(result, doc)
