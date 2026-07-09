"""
Tests for the content sync pipeline: sync_entry_content.

These tests verify the full pipeline — entities synced first, then
mentions, then conditional save — using real database-backed entries
because sync_entities and sync_mentions both require the database.
"""
from unittest.mock import patch

from core.tests.base import BaseServiceTestCase
from core.tests.factories import EMPTY_DOC, make_lims_table_doc, make_doc_with_ref
from core.mentions.models import Mention
from core_mods.eln.models import NotebookEntry
from core_mods.eln.sync import sync_entry_content, _collect_lims_table_fingerprint
from core_mods.lims.models import EntityType, Entity


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

        with patch.object(NotebookEntry, "save") as mock_save:
            result = sync_entry_content(self.entry)

        self.assertIs(result, self.entry)
        mock_save.assert_not_called()
        self.assertEqual(Entity.objects.count(), 0)
        self.assertEqual(Mention.objects.count(), 0)

    # ── Entity sync ────────────────────────────────────────────────────

    def test_syncs_entities_from_table(self):
        """limsTable creates Entity rows, patches IDs into content, saves."""

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

        self.entry.content = make_doc_with_ref(self.target.display_id)
        self.entry.save()

        sync_entry_content(self.entry)

        self.assertEqual(Mention.objects.count(), 1)
        mention = Mention.objects.first()
        self.assertEqual(mention.source_id, self.entry.id)
        self.assertEqual(mention.target_id, self.target.id)

    def test_removed_refs_delete_mentions(self):
        """Reference node removed → Mention deleted."""

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

        self.entry.content = make_doc_with_ref("E99999")
        self.entry.save()

        sync_entry_content(self.entry)

        self.assertEqual(Mention.objects.count(), 0)

    # ── Ordering: entities before mentions ──────────────────────────────

    def test_entities_before_mentions(self):
        """When an entry has both limsTable and reference nodes, entities
        are synced before mentions so that newly created entity display IDs
        are resolvable by reference nodes in table cells."""

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

    # ── Signal-based sync ──────────────────────────────────────────────

    def test_signal_is_connected(self):
        """A receiver is connected to entry_content_sync for NotebookEntry."""
        from core.signals import entry_content_sync

        receivers = entry_content_sync._live_receivers(sender=NotebookEntry)
        self.assertTrue(
            any(r[0] for r in receivers),
            "No receiver connected to entry_content_sync",
        )

    def test_signal_preserves_pipeline_order(self):
        """Receivers run before mentions, so entities sync before mention resolution."""

        with patch(
            "core_mods.eln.sync.sync_mentions",
        ) as mock_mentions:
            doc = make_lims_table_doc(
                self.blood_type.id,
                rows_data=[{"volume": "50", "patient": "Patient A"}],
                entity_type=self.blood_type,
            )
            self.entry.content = doc
            self.entry.save()

    
            sync_entry_content(self.entry)

            # Mentions were called (after signal processing)
            mock_mentions.assert_called_once()
            # The content passed to mentions already has entity IDs patched
            _, content_arg = mock_mentions.call_args[0]
            rows = content_arg["content"][0]["attrs"]["rows"]
            self.assertIsNotNone(rows[0].get("entityId"))

    def test_custom_receiver_modifies_content(self):
        """An additional receiver connected to entry_content_sync can modify content.

        This verifies that the signal dispatch is the extension point for
        future mods that want to hook into the sync pipeline.
        """
        from core.signals import entry_content_sync

        def adding_receiver(sender, entry, content, **kwargs):
            """Receiver that adds 'EXTENSION_RAN' marker to the content."""
            return {"type": "doc", "content": [{"text": "EXTENSION_RAN"}]}

        entry_content_sync.connect(
            adding_receiver, sender=NotebookEntry, dispatch_uid="test_receiver"
        )
        try:
            self.entry.content = EMPTY_DOC
            self.entry.save()

            result = sync_entry_content(self.entry)

            # The content was modified by the receiver (last non-None wins)
            self.assertEqual(
                result.content["content"][0]["text"], "EXTENSION_RAN"
            )
        finally:
            entry_content_sync.disconnect(dispatch_uid="test_receiver")


# ── Fingerprint collection unit tests ───────────────────────────────────────


class FingerprintCollectionTests(BaseServiceTestCase):
    """Unit tests for _collect_lims_table_fingerprint."""

    def setUp(self):
        super().setUp()

    def test_empty_doc_returns_empty_frozenset(self):
        """No limsTable nodes → empty frozenset."""

        result = _collect_lims_table_fingerprint(EMPTY_DOC)
        self.assertEqual(result, frozenset())

    def test_plain_table_skipped(self):
        """limsTable without schemaId is skipped (plain table)."""

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "title": "Plain Table",
                        "columns": [{"name": "a", "type": "Text"}],
                        "rows": [
                            {"entityId": None, "displayId": "#new", "__name": "R1", "values": {"a": "x"}},
                        ],
                    },
                }
            ],
        }
        result = _collect_lims_table_fingerprint(doc)
        # No schemaId → skipped.
        self.assertEqual(result, frozenset())

    def test_single_table_with_rows(self):
        """limsTable with schemaId and rows produces correct fingerprint."""

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": 42,
                        "title": "My Table",
                        "columns": [{"name": "vol", "type": "Number"}],
                        "rows": [
                            {
                                "entityId": None,
                                "displayId": "#new",
                                "__name": "Sample 1",
                                "values": {"vol": "50"},
                            },
                        ],
                    },
                }
            ],
        }
        result = _collect_lims_table_fingerprint(doc)

        self.assertEqual(len(result), 1)
        schema_id, row_fps = next(iter(result))
        self.assertEqual(schema_id, 42)
        self.assertEqual(len(row_fps), 1)
        row_fp = next(iter(row_fps))
        # (entityId, displayId, __name, values_tuple)
        self.assertEqual(row_fp[0], None)        # entityId
        self.assertEqual(row_fp[1], "#new")       # displayId
        self.assertEqual(row_fp[2], "Sample 1")   # __name
        self.assertEqual(row_fp[3], (("vol", "50"),))  # values

    def test_multiple_tables_same_schema(self):
        """Two tables sharing the same schemaId produce separate entries."""

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": 1,
                        "rows": [
                            {"entityId": None, "displayId": "#new", "__name": "A", "values": {"x": "1"}},
                        ],
                    },
                },
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": 1,
                        "rows": [
                            {"entityId": None, "displayId": "#new", "__name": "B", "values": {"x": "2"}},
                        ],
                    },
                },
            ],
        }
        result = _collect_lims_table_fingerprint(doc)

        # Two entries: one per table, both with same schemaId=1.
        self.assertEqual(len(result), 2)
        for schema_id, row_fps in result:
            self.assertEqual(schema_id, 1)
            self.assertEqual(len(row_fps), 1)

    def test_deterministic(self):
        """Same input produces same fingerprint (deterministic ordering)."""

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": 1,
                        "rows": [
                            {"entityId": 10, "displayId": "B1", "__name": "X", "values": {"a": "1", "b": "2"}},
                        ],
                    },
                }
            ],
        }
        fp1 = _collect_lims_table_fingerprint(doc)
        fp2 = _collect_lims_table_fingerprint(doc)
        self.assertEqual(fp1, fp2)
        self.assertEqual(hash(fp1), hash(fp2))

    def test_key_ordering_does_not_affect_fingerprint(self):
        """Values dict with keys in different order produces same fingerprint."""

        doc1 = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": 1,
                        "rows": [
                            {"entityId": None, "displayId": "#new", "__name": "X",
                             "values": {"a": "1", "b": "2"}},
                        ],
                    },
                }
            ],
        }
        # Same doc, but keys in values dict are in different order
        doc2 = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": 1,
                        "rows": [
                            {"entityId": None, "displayId": "#new", "__name": "X",
                             "values": {"b": "2", "a": "1"}},
                        ],
                    },
                }
            ],
        }
        fp1 = _collect_lims_table_fingerprint(doc1)
        fp2 = _collect_lims_table_fingerprint(doc2)
        self.assertEqual(fp1, fp2)


# ── Fingerprint pre-check integration tests ──────────────────────────────────


class FingerprintPreCheckTests(BaseServiceTestCase):
    """Tests for the fingerprint pre-check in sync_entry_content.

    When old_content is provided, expensive pipeline steps (signal dispatch,
    mention sync) are skipped if neither limsTable nor reference fingerprints
    changed.  When old_content is absent the full pipeline always runs.
    """

    def setUp(self):
        super().setUp()
        self.entry = NotebookEntry.objects.create(
            title="Test Entry", content=EMPTY_DOC,
            folder=self.folder, author=self.user,
        )
        self.blood_type = EntityType.objects.create(
            name="Blood", prefix="BLOOD", columns=[
                {"name": "volume", "type": "Number"},
            ],
        )
        self.target = NotebookEntry.objects.create(
            title="Target Entry", content=EMPTY_DOC,
            folder=self.folder, author=self.user,
        )

    # ── Text-only edit → pipeline skipped ────────────────────────────────

    def test_text_only_edit_skips_sync_pipeline(self):
        """When only text changes, signal and mentions are skipped."""

        old_doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}],
        }
        new_doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "World"}]}],
        }

        self.entry.content = new_doc
        self.entry.save()

        with patch(
            "core_mods.eln.sync.entry_content_sync.send"
        ) as mock_signal, patch(
            "core_mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            result = sync_entry_content(self.entry, old_content=old_doc)

        self.assertIs(result, self.entry)
        mock_signal.assert_not_called()
        mock_mentions.assert_not_called()

    def test_text_only_edit_noop_when_fingerprints_match(self):
        """Fingerprints match → entry returned unchanged, no save."""

        # Both old and new are plain text — no limsTable, no references.
        old_doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "A"}]}],
        }
        new_doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "B"}]}],
        }

        self.entry.content = new_doc
        self.entry.save()

        with patch.object(NotebookEntry, "save") as mock_save:
            result = sync_entry_content(self.entry, old_content=old_doc)

        # No expensive sync steps, no save needed (content is already set).
        mock_save.assert_not_called()
        self.assertEqual(result, self.entry)

    # ── limsTable change → full pipeline ─────────────────────────────────

    def test_lims_table_change_runs_full_pipeline(self):
        """When limsTable rows change, full pipeline runs."""

        old_doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50"}],
            entity_type=self.blood_type,
        )
        new_doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "75"}],  # different value
            entity_type=self.blood_type,
        )

        self.entry.content = new_doc
        self.entry.save()

        with patch(
            "core_mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal, patch(
            "core_mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            sync_entry_content(self.entry, old_content=old_doc)

        mock_signal.assert_called()
        mock_mentions.assert_called()

    def test_lims_table_row_added_runs_full_pipeline(self):
        """Adding a row to a limsTable → full pipeline."""

        old_doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50"}],
            entity_type=self.blood_type,
        )
        new_doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50"}, {"volume": "75"}],
            entity_type=self.blood_type,
        )

        self.entry.content = new_doc
        self.entry.save()

        with patch(
            "core_mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal, patch(
            "core_mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            sync_entry_content(self.entry, old_content=old_doc)

        mock_signal.assert_called()
        mock_mentions.assert_called()

    def test_lims_table_row_removed_runs_full_pipeline(self):
        """Removing a row from a limsTable → full pipeline."""

        old_doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50"}, {"volume": "75"}],
            entity_type=self.blood_type,
        )
        new_doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50"}],
            entity_type=self.blood_type,
        )

        self.entry.content = new_doc
        self.entry.save()

        with patch(
            "core_mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal, patch(
            "core_mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            sync_entry_content(self.entry, old_content=old_doc)

        mock_signal.assert_called()
        mock_mentions.assert_called()

    # ── Reference change → full pipeline ─────────────────────────────────

    def test_reference_change_runs_full_pipeline(self):
        """When a reference node is added, full pipeline runs."""

        old_doc = EMPTY_DOC
        new_doc = make_doc_with_ref(self.target.display_id)

        self.entry.content = new_doc
        self.entry.save()

        with patch(
            "core_mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal, patch(
            "core_mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            sync_entry_content(self.entry, old_content=old_doc)

        mock_signal.assert_called()
        mock_mentions.assert_called()

    def test_reference_removed_runs_full_pipeline(self):
        """When a reference node is removed, full pipeline runs."""

        old_doc = make_doc_with_ref(self.target.display_id)
        new_doc = EMPTY_DOC

        self.entry.content = new_doc
        self.entry.save()

        with patch(
            "core_mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal, patch(
            "core_mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            sync_entry_content(self.entry, old_content=old_doc)

        mock_signal.assert_called()
        mock_mentions.assert_called()

    # ── Backward compatibility ───────────────────────────────────────────

    def test_no_old_content_runs_full_pipeline(self):
        """When old_content is None (create, or backward compat), full pipeline runs."""

        self.entry.content = make_doc_with_ref(self.target.display_id)
        self.entry.save()

        with patch(
            "core_mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal, patch(
            "core_mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            sync_entry_content(self.entry)  # no old_content

        mock_signal.assert_called()
        mock_mentions.assert_called()

    def test_old_content_none_still_syncs(self):
        """Caller that doesn't pass old_content gets the existing behaviour."""

        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50"}],
            entity_type=self.blood_type,
        )
        self.entry.content = doc
        self.entry.save()

        with patch(
            "core_mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal:
            sync_entry_content(self.entry, old_content=None)

        mock_signal.assert_called()

    # ── Same-content no-op ───────────────────────────────────────────────

    def test_identical_content_skips_pipeline(self):
        """When content hasn't changed at all, pipeline is skipped."""

        doc = make_doc_with_ref(self.target.display_id)
        self.entry.content = doc
        self.entry.save()

        with patch(
            "core_mods.eln.sync.entry_content_sync.send"
        ) as mock_signal, patch(
            "core_mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            result = sync_entry_content(self.entry, old_content=doc)

        mock_signal.assert_not_called()
        mock_mentions.assert_not_called()
        self.assertIs(result, self.entry)

    # ── Mixed: both fingerprints changed → full pipeline ─────────────────

    def test_both_fingerprints_changed_runs_full_pipeline(self):
        """When both limsTable and references change, full pipeline runs once."""

        ref_type = EntityType.objects.create(
            name="Ref Type", prefix="REF", columns=[
                {"name": "linked_to", "type": "Reference"},
            ],
        )
        old_doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": ref_type.id,
                        "columns": ref_type.columns,
                        "rows": [
                            {"entityId": None, "displayId": "#new", "__name": "E1",
                             "values": {"linked_to": "E00001"}},
                        ],
                    },
                },
            ],
        }
        new_doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": ref_type.id,
                        "columns": ref_type.columns,
                        "rows": [
                            {"entityId": None, "displayId": "#new", "__name": "E1",
                             "values": {"linked_to": "E00002"}},  # different ref
                        ],
                    },
                },
            ],
        }

        self.entry.content = new_doc
        self.entry.save()

        with patch(
            "core_mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal, patch(
            "core_mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            sync_entry_content(self.entry, old_content=old_doc)

        mock_signal.assert_called()
        mock_mentions.assert_called()

    # ── End-to-end via API ───────────────────────────────────────────────

    def test_text_only_edit_via_api_does_not_run_entity_sync(self):
        """End-to-end: text-only PUT passes old_content through the view."""
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(user=self.user)

        # Create entry
        resp = client.post(
            "/api/eln/entries/",
            {"title": "E2E Test", "content": EMPTY_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        display_id = resp.data["display_id"]

        # First PUT with content — establishes ContentVersion #1.
        text_doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "First"}]}],
        }
        resp = client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "E2E Test", "content": text_doc, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        # Second PUT — text-only change, same limsTable/ref fingerprints.
        # The view captures old_content before save and passes to sync_entry_content.
        text_doc2 = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Second"}]}],
        }
        with patch(
            "core_mods.eln.sync.entry_content_sync.send"
        ) as mock_signal, patch(
            "core_mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            resp = client.put(
                f"/api/eln/entries/{display_id}/",
                {"title": "E2E Test", "content": text_doc2, "folder": self.folder.id},
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            # The signal and mentions should be skipped because fingerprints
            # match — both docs are plain text with no limsTable/references.
            mock_signal.assert_not_called()
            mock_mentions.assert_not_called()
