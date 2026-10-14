"""
Tests for the mentions service: sync_mentions, resolve_display_id, PREFIX_MAP.
"""
from django.test import TestCase
from helix_core.core.tests.factories import EMPTY_DOC
from helix_core.mentions.models import Mention
from django.contrib.contenttypes.models import ContentType
from helix_core.tests.fixtures.external_mod.models import ConcreteTestEntity
from helix_core.tests.fixtures.external_mod.testing import register_external_mod_fixture

DOC_WITH_ONE_REFERENCE = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "See "},
                {"type": "reference", "attrs": {"displayId": "T2"}},
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
                {"type": "reference", "attrs": {"displayId": "T1"}},
                {"type": "text", "text": " and "},
                {"type": "reference", "attrs": {"displayId": "T2"}},
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
                        {"type": "reference", "attrs": {"displayId": "T3"}},
                    ],
                }
            ],
        }
    ],
}


class SyncMentionsTests(TestCase):
    """Tracer-bullet + incremental tests for sync_mentions()."""

    def setUp(self):
        super().setUp()
        from helix_core.core.models import Folder, Project, User
        self.user = User.objects.create_user(username="mention-user", password="pass")
        self.project = Project.objects.create(name="Mention Project")
        self.folder = Folder.objects.create(
            name="Mention Folder", parent=None, project=self.project
        )
        from helix_core.models import Schema, SchemaType
        register_external_mod_fixture()
        fixture_type, _ = SchemaType.objects.get_or_create(
            model="helix_core.tests.fixtures.external_mod.models.ConcreteTestEntity",
            defaults={
                "display_name": "Fixture Content",
                "workspace_id": "fixture",
                "columns": [],
            },
        )
        self.fixture_schema, _ = Schema.objects.get_or_create(
            schema_type=fixture_type,
            is_default=True,
            defaults={
                "name": "Default",
                "prefix": "T",
                "columns": [],
            },
        )
        self.source = ConcreteTestEntity.objects.create(
            name="Source Fixture", properties=EMPTY_DOC, source=self.folder, author=self.user,
            schema=self.fixture_schema,
        )
        self.target = ConcreteTestEntity.objects.create(
            name="Target Fixture", properties=EMPTY_DOC, source=self.folder, author=self.user,
            schema=self.fixture_schema,
        )
        self.content_type = ContentType.objects.get_for_model(ConcreteTestEntity)

        # Display IDs are generated from the fixture schema's T prefix.

    def tearDown(self):
        # The fixture model is registered dynamically rather than installed in
        # Django's app registry, so flush cannot discover its generic relation
        # rows when checking FK constraints after this TestCase.
        Mention.objects.all().delete()
        super().tearDown()

    def test_sync_mention_lifecycle_contracts(self):
        """A doc with one reference node → one Mention row created."""
        from helix_core.mentions.sync import sync_mentions

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
        self.assertEqual(mention.source_type_id, self.content_type.id)
        self.assertEqual(mention.source_id, self.source.id)
        self.assertEqual(mention.target_type_id, self.content_type.id)
        self.assertEqual(mention.target_id, self.target.id)

        # Reconciliation removes a Mention when its reference is removed.
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

        # Unresolvable IDs are ignored.
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "reference", "attrs": {"displayId": "T99999"}},
                    ],
                }
            ],
        }

        sync_mentions(self.source, doc)

        self.assertEqual(Mention.objects.count(), 0)

        # A document without references is a no-op.
        sync_mentions(self.source, EMPTY_DOC)

        self.assertEqual(Mention.objects.count(), 0)

        Mention.objects.all().delete()
        # Multiple references create separate Mention rows.
        target2 = ConcreteTestEntity.objects.create(
            name="Second Target", properties=EMPTY_DOC, source=self.folder, author=self.user,
            schema=self.fixture_schema,
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

        Mention.objects.all().delete()
        # Re-syncing the same reference does not duplicate rows.
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

        Mention.objects.all().delete()
        # Nested reference nodes are discovered by the document walker.
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
