"""
Tests for the references service: sync_mentions, resolve_display_id, PREFIX_MAP.
"""
from django.test import TestCase

from core.models import Folder, User
from eln.models import NotebookEntry, Mention

# --- TipTap document fixtures ---

EMPTY_DOC = {"type": "doc", "content": [{"type": "paragraph"}]}

DOC_WITH_ONE_REFERENCE = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "See "},
                {"type": "reference", "attrs": {"displayId": "E2"}},
                {"type": "text", "text": " for details."},
            ],
        }
    ],
}

DOC_WITH_MULTIPLE_REFERENCES = {
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

# Reference inside a nested structure (e.g. a blockquote)
DOC_WITH_NESTED_REFERENCE = {
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


class SyncMentionsTests(TestCase):
    """Tracer-bullet + incremental tests for sync_mentions()."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.folder = Folder.objects.create(name="Default")
        self.source = NotebookEntry.objects.create(
            title="Source Entry", content=EMPTY_DOC, folder=self.folder, author=self.user
        )
        self.target = NotebookEntry.objects.create(
            title="Target Entry", content=EMPTY_DOC, folder=self.folder, author=self.user
        )
        # We need the display_id to match what the reference node points to.
        # display_id is auto-generated (E1, E2, …). The source is E1, target is E2.
        # But we can't control this easily — so let's just use whatever they got.

    def test_tracer_sync_creates_mention_for_reference_node(self):
        """A doc with one reference node → one Mention row created."""
        from references.services import sync_mentions

        # Point the reference at the target entry's actual display_id.
        target_id = self.target.display_id
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "See "},
                        {"type": "reference", "attrs": {"displayId": target_id}},
                        {"type": "text", "text": " for details."},
                    ],
                }
            ],
        }

        sync_mentions(self.source, doc)

        self.assertEqual(Mention.objects.count(), 1)
        mention = Mention.objects.first()
        self.assertEqual(mention.source_type.model, "notebookentry")
        self.assertEqual(mention.source_id, self.source.id)
        self.assertEqual(mention.target_type.model, "notebookentry")
        self.assertEqual(mention.target_id, self.target.id)

    def test_sync_removes_mentions_when_reference_removed(self):
        """Removing a reference node from the doc deletes the Mention row."""
        from references.services import sync_mentions

        target_id = self.target.display_id
        doc_with_ref = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "reference", "attrs": {"displayId": target_id}},
                    ],
                }
            ],
        }

        # First sync creates the mention
        sync_mentions(self.source, doc_with_ref)
        self.assertEqual(Mention.objects.count(), 1)

        # Second sync with a doc that has no reference → mention deleted
        sync_mentions(self.source, EMPTY_DOC)
        self.assertEqual(Mention.objects.count(), 0)

    def test_sync_skips_unresolvable_display_ids(self):
        """A reference to a non-existent entry is silently skipped."""
        from references.services import sync_mentions

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "reference", "attrs": {"displayId": "E99999"}},
                    ],
                }
            ],
        }

        sync_mentions(self.source, doc)

        self.assertEqual(Mention.objects.count(), 0)

    def test_sync_noop_when_no_references(self):
        """A doc with no reference nodes is a no-op."""
        from references.services import sync_mentions

        sync_mentions(self.source, EMPTY_DOC)

        self.assertEqual(Mention.objects.count(), 0)

    def test_sync_handles_multiple_references(self):
        """Each reference node creates a separate Mention row."""
        from references.services import sync_mentions

        target2 = NotebookEntry.objects.create(
            title="Second Target", content=EMPTY_DOC, folder=self.folder, author=self.user
        )

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "reference", "attrs": {"displayId": self.target.display_id}},
                        {"type": "text", "text": " and "},
                        {"type": "reference", "attrs": {"displayId": target2.display_id}},
                    ],
                }
            ],
        }

        sync_mentions(self.source, doc)

        self.assertEqual(Mention.objects.count(), 2)
        target_ids = set(Mention.objects.values_list("target_id", flat=True))
        self.assertEqual(target_ids, {self.target.id, target2.id})

    def test_sync_updates_existing_mention(self):
        """Re-syncing with the same reference doesn't duplicate."""
        from references.services import sync_mentions

        target_id = self.target.display_id
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "reference", "attrs": {"displayId": target_id}},
                    ],
                }
            ],
        }

        sync_mentions(self.source, doc)
        self.assertEqual(Mention.objects.count(), 1)

        # Re-sync with same doc: no duplicates, no deletions
        sync_mentions(self.source, doc)
        self.assertEqual(Mention.objects.count(), 1)

    def test_sync_nested_references(self):
        """Reference nodes nested inside blockquotes etc. are found."""
        from references.services import sync_mentions

        target_id = self.target.display_id
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "blockquote",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "reference", "attrs": {"displayId": target_id}},
                            ],
                        }
                    ],
                }
            ],
        }

        sync_mentions(self.source, doc)
        self.assertEqual(Mention.objects.count(), 1)
