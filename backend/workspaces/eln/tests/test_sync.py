"""
Tests for the content sync pipeline: sync_entry_content.

These tests verify the full pipeline — entities synced first, then
mentions, then conditional save — using real database-backed entries
because sync_entities and sync_mentions both require the database.
"""
from unittest.mock import patch

from core.tests.base import BaseServiceTestCase
from core.tests.factories import EMPTY_DOC, make_lims_table_doc, make_doc_with_ref
from workspaces.eln.models import NotebookEntry, Mention
from workspaces.lims.models import EntityType, Entity


class SyncEntryContentTests(BaseServiceTestCase):
    """Tests for sync_entry_content pipeline."""

    def setUp(self):
        super().setUp()
        self.entry = NotebookEntry.objects.create(
            title="Test Entry", content=EMPTY_DOC,
            folder=self.folder, author=self.user,
        )
        self.blood_type = EntityType.objects.create(
            name="Blood", prefix="BLOOD", columns=[
                {"name": "volume", "type": "Number"},
                {"name": "patient", "type": "Text"},
            ],
        )
        self.target = NotebookEntry.objects.create(
            title="Target Entry", content=EMPTY_DOC,
            folder=self.folder, author=self.user,
        )

    # ── No-op ──────────────────────────────────────────────────────────

    def test_noop_empty_entry(self):
        """Entry with no limsTable or reference nodes → no changes, no save."""
        from workspaces.eln.sync import sync_entry_content

        with patch.object(NotebookEntry, "save") as mock_save:
            result = sync_entry_content(self.entry)

        self.assertIs(result, self.entry)
        mock_save.assert_not_called()
        self.assertEqual(Entity.objects.count(), 0)
        self.assertEqual(Mention.objects.count(), 0)

    # ── Entity sync ────────────────────────────────────────────────────

    def test_syncs_entities_from_table(self):
        """limsTable creates Entity rows, patches IDs into content, saves."""
        from workspaces.eln.sync import sync_entry_content

        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50", "patient": "Patient A"}],
            entity_type=self.blood_type,
        )
        self.entry.content = doc
        self.entry.save()

        sync_entry_content(self.entry)

        self.assertEqual(Entity.objects.count(), 1)
        entity = Entity.objects.first()
        self.assertEqual(entity.source_entry, self.entry)
        self.assertEqual(entity.properties, {"volume": "50", "patient": "Patient A"})

        # Content was patched and saved
        self.entry.refresh_from_db()
        rows = self.entry.content["content"][0]["attrs"]["rows"]
        self.assertEqual(rows[0]["entityId"], entity.id)
        self.assertEqual(rows[0]["displayId"], entity.display_id)

    def test_removed_rows_delete_entities(self):
        """Rows removed from a limsTable → entities deleted.

        Note: sync_entities only reconciles entities within the context of
        limsTable nodes present in the document.  If the entire table node
        is removed, orphan cleanup is not performed (this is existing
        behaviour — not changed by this refactoring).
        """
        from workspaces.eln.sync import sync_entry_content

        # Create two entities via limsTable
        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[
                {"volume": "50", "patient": "Patient A"},
                {"volume": "75", "patient": "Patient B"},
            ],
            entity_type=self.blood_type,
        )
        self.entry.content = doc
        self.entry.save()
        sync_entry_content(self.entry)
        self.assertEqual(Entity.objects.count(), 2)

        # Second sync: keep only one row (the table node still exists)
        self.entry.refresh_from_db()
        patched = self.entry.content
        rows = patched["content"][0]["attrs"]["rows"]
        # Keep only the first row
        patched["content"][0]["attrs"]["rows"] = [rows[0]]
        self.entry.content = patched
        self.entry.save()
        sync_entry_content(self.entry)

        self.assertEqual(Entity.objects.count(), 1)

    # ── Mention sync ───────────────────────────────────────────────────

    def test_syncs_mentions_from_refs(self):
        """Reference nodes create Mention rows."""
        from workspaces.eln.sync import sync_entry_content

        self.entry.content = make_doc_with_ref(self.target.display_id)
        self.entry.save()

        sync_entry_content(self.entry)

        self.assertEqual(Mention.objects.count(), 1)
        mention = Mention.objects.first()
        self.assertEqual(mention.source_id, self.entry.id)
        self.assertEqual(mention.target_id, self.target.id)

    def test_removed_refs_delete_mentions(self):
        """Reference node removed → Mention deleted."""
        from workspaces.eln.sync import sync_entry_content

        # Create mention
        self.entry.content = make_doc_with_ref(self.target.display_id)
        self.entry.save()
        sync_entry_content(self.entry)
        self.assertEqual(Mention.objects.count(), 1)

        # Remove reference
        self.entry.content = EMPTY_DOC
        self.entry.save()
        sync_entry_content(self.entry)
        self.assertEqual(Mention.objects.count(), 0)

    def test_unresolvable_refs_skipped(self):
        """Reference to nonexistent display_id → silently skipped."""
        from workspaces.eln.sync import sync_entry_content

        self.entry.content = make_doc_with_ref("E99999")
        self.entry.save()

        sync_entry_content(self.entry)

        self.assertEqual(Mention.objects.count(), 0)

    # ── Ordering: entities before mentions ──────────────────────────────

    def test_entities_before_mentions(self):
        """When an entry has both limsTable and reference nodes, entities
        are synced before mentions so that newly created entity display IDs
        are resolvable by reference nodes in table cells."""
        from workspaces.eln.sync import sync_entry_content

        # Create an EntityType with a Reference column
        ref_type = EntityType.objects.create(
            name="Ref Type", prefix="REF", columns=[
                {"name": "linked_to", "type": "Reference"},
            ],
        )

        # Build a doc with both a limsTable (containing a reference cell)
        # and an inline reference node
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": ref_type.id,
                        "title": "Ref Table",
                        "columns": ref_type.columns,
                        "rows": [
                            {
                                "entityId": None,
                                "displayId": "#new",
                                "__name": "Ref Entity",
                                "values": {"linked_to": self.target.display_id},
                            },
                        ],
                    },
                },
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "reference", "attrs": {"displayId": self.target.display_id}},
                    ],
                },
            ],
        }
        self.entry.content = doc
        self.entry.save()

        sync_entry_content(self.entry)

        # Entity was created from limsTable
        self.assertEqual(Entity.objects.count(), 1)

        # Mentions were created from both:
        # - the Reference cell in the limsTable (pointing at target)
        # - the inline reference node (also pointing at target)
        # Both resolve to the same target, so 1 mention (deduplicated by set)
        self.assertEqual(Mention.objects.count(), 1)
        mention = Mention.objects.first()
        self.assertEqual(mention.target_id, self.target.id)

    # ── Content patching ───────────────────────────────────────────────

    def test_content_patched_on_save(self):
        """Entity IDs and displayIds are written back to JSON content."""
        from workspaces.eln.sync import sync_entry_content

        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50", "patient": "Patient A"}],
            entity_type=self.blood_type,
        )
        self.entry.content = doc
        self.entry.save()

        sync_entry_content(self.entry)

        self.entry.refresh_from_db()
        rows = self.entry.content["content"][0]["attrs"]["rows"]
        self.assertIsNotNone(rows[0]["entityId"])
        self.assertNotEqual(rows[0]["displayId"], "#new")

    # ── No unnecessary save ────────────────────────────────────────────

    def test_no_unnecessary_save(self):
        """Unchanged content after sync → no save() call."""
        from workspaces.eln.sync import sync_entry_content

        # Sync once to stabilise content (entity IDs patched in)
        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50", "patient": "Patient A"}],
            entity_type=self.blood_type,
        )
        self.entry.content = doc
        self.entry.save()
        sync_entry_content(self.entry)

        # Second sync with same content → no additional save
        with patch.object(NotebookEntry, "save") as mock_save:
            sync_entry_content(self.entry)

        mock_save.assert_not_called()
