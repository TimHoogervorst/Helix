"""
Tests for the LIMS services: sync_entities, walk_lims_tables.
"""
from django.test import TestCase

from core.tests.base import BaseServiceTestCase
from core.tests.factories import EMPTY_DOC, make_lims_table_doc
from workspaces.eln.models import NotebookEntry
from workspaces.lims.models import EntityType, Entity


class SyncEntitiesTests(BaseServiceTestCase):
    """Tracer-bullet + incremental tests for sync_entities()."""

    def setUp(self):
        super().setUp()
        self.entry = NotebookEntry.objects.create(
            title="Entry With Table", content=EMPTY_DOC,
            folder=self.folder, author=self.user,
        )
        self.blood_type = EntityType.objects.create(
            name="Blood", prefix="BLOOD", columns=[
                {"name": "volume", "type": "Number"},
                {"name": "patient", "type": "Text"},
            ],
        )

    def test_tracer_sync_creates_entity_from_lims_table(self):
        """A limsTable with one row → one Entity created, displayId patched in attrs.rows."""
        from workspaces.lims.services import sync_entities

        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50", "patient": "Patient A"}],
            entity_type=self.blood_type,
        )

        updated_content = sync_entities(self.entry, doc)

        # Entity created
        self.assertEqual(Entity.objects.count(), 1)
        entity = Entity.objects.first()
        self.assertEqual(entity.name, "Test Table row 1")
        self.assertEqual(entity.entity_type, self.blood_type)
        self.assertEqual(entity.source_entry, self.entry)
        self.assertEqual(entity.properties, {"volume": "50", "patient": "Patient A"})

        # displayId patched into rows
        rows = updated_content["content"][0]["attrs"]["rows"]
        self.assertEqual(rows[0]["displayId"], entity.display_id)
        self.assertEqual(rows[0]["entityId"], entity.id)

    def test_sync_creates_multiple_entities(self):
        """Each row in the limsTable gets its own Entity."""
        from workspaces.lims.services import sync_entities

        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[
                {"volume": "10", "patient": "Alice"},
                {"volume": "20", "patient": "Bob"},
            ],
            entity_type=self.blood_type,
        )

        sync_entities(self.entry, doc)

        self.assertEqual(Entity.objects.count(), 2)
        names = set(Entity.objects.values_list("name", flat=True))
        self.assertEqual(names, {"Test Table row 1", "Test Table row 2"})

    def test_sync_updates_existing_entity_properties(self):
        """Re-saving with changed cell values updates entity properties."""
        from workspaces.lims.services import sync_entities

        # First save creates the entity
        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50", "patient": "Patient A"}],
            entity_type=self.blood_type,
        )
        updated = sync_entities(self.entry, doc)
        entity_display_id = updated["content"][0]["attrs"]["rows"][0]["displayId"]
        entity_db_id = updated["content"][0]["attrs"]["rows"][0]["entityId"]
        self.assertEqual(Entity.objects.count(), 1)

        # Second save with different cell values —
        # simulate the real frontend round-trip: use the patched content
        # from the first save (which has entityId + displayId) and only
        # change cell values — no manual injection.
        doc2_content = updated
        doc2_content["content"][0]["attrs"]["rows"][0]["values"]["volume"] = "75"
        doc2_content["content"][0]["attrs"]["rows"][0]["values"]["patient"] = "Patient B"

        updated2 = sync_entities(self.entry, doc2_content)

        # Must still have exactly 1 entity — no duplicates created
        self.assertEqual(Entity.objects.count(), 1)
        entity = Entity.objects.get(display_id=entity_display_id)
        self.assertEqual(entity.properties, {"volume": "75", "patient": "Patient B"})
        # entityId must remain stable across saves
        self.assertEqual(
            updated2["content"][0]["attrs"]["rows"][0]["entityId"],
            entity_db_id,
        )

    def test_roundtrip_preserves_entity_ids_no_new_entities_created(self):
        """Full frontend→backend→frontend→backend round-trip without manual
        entityId injection: patched content from the first sync is re-submitted
        (simulating the editor round-trip), and must update — not duplicate."""
        from workspaces.lims.services import sync_entities

        # ── First save (simulates POST from frontend with entityId: null) ──
        doc1 = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[
                {"volume": "100", "patient": "Alice"},
                {"volume": "200", "patient": "Bob"},
            ],
            entity_type=self.blood_type,
        )
        patched1 = sync_entities(self.entry, doc1)
        self.assertEqual(Entity.objects.count(), 2)

        # Capture patched entityIds and displayIds
        rows1 = patched1["content"][0]["attrs"]["rows"]
        e1_id = rows1[0]["entityId"]
        e1_display = rows1[0]["displayId"]
        e2_id = rows1[1]["entityId"]
        e2_display = rows1[1]["displayId"]

        self.assertIsNotNone(e1_id)
        self.assertIsNotNone(e2_id)
        self.assertNotEqual(e1_display, "#new")

        # ── Second save (simulates editor round-trip: frontend loaded
        #    patched content, user edits a cell, editor.getJSON() sends
        #    the patched content back) ──
        doc2 = patched1  # This is what editor.getJSON() would return
        doc2["content"][0]["attrs"]["rows"][0]["values"]["volume"] = "150"
        patched2 = sync_entities(self.entry, doc2)

        # ── Assertions ──
        # No duplicate entities created
        self.assertEqual(Entity.objects.count(), 2)

        rows2 = patched2["content"][0]["attrs"]["rows"]
        self.assertEqual(rows2[0]["entityId"], e1_id)
        self.assertEqual(rows2[0]["displayId"], e1_display)
        self.assertEqual(rows2[1]["entityId"], e2_id)
        self.assertEqual(rows2[1]["displayId"], e2_display)

        # Properties updated
        e1 = Entity.objects.get(id=e1_id)
        self.assertEqual(e1.properties["volume"], "150")
        self.assertEqual(e1.properties["patient"], "Alice")

    def test_roundtrip_add_and_remove_row_preserves_existing(self):
        """Adding a new row and removing an old row in one save must create
        one entity, delete one entity, and preserve the remaining one."""
        from workspaces.lims.services import sync_entities

        # ── First save: 2 rows ──
        doc1 = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[
                {"volume": "10", "patient": "A"},
                {"volume": "20", "patient": "B"},
            ],
            entity_type=self.blood_type,
        )
        patched1 = sync_entities(self.entry, doc1)
        self.assertEqual(Entity.objects.count(), 2)
        rows1 = patched1["content"][0]["attrs"]["rows"]
        keep_id = rows1[0]["entityId"]
        keep_display = rows1[0]["displayId"]
        remove_display = rows1[1]["displayId"]

        # ── Second save: keep row A (modified), remove row B, add new row C ──
        doc2 = patched1
        rows2 = doc2["content"][0]["attrs"]["rows"]
        # Modify the kept row
        rows2[0]["values"]["volume"] = "30"
        # Replace row B with a new row (entityId: null, fresh displayId)
        rows2[1] = {
            "entityId": None,
            "displayId": "#new-row",
            "values": {"volume": "40", "patient": "C"},
        }

        patched2 = sync_entities(self.entry, doc2)

        # ── Assertions ──
        # Still 2 entities total (1 updated, 1 deleted, 1 created = net 2)
        self.assertEqual(Entity.objects.count(), 2)

        # The kept entity is still there and updated
        kept = Entity.objects.get(id=keep_id)
        self.assertEqual(kept.properties["volume"], "30")
        self.assertEqual(kept.display_id, keep_display)

        # The removed entity is gone
        self.assertFalse(Entity.objects.filter(display_id=remove_display).exists())

        # A new entity was created for the new row (different display_id)
        new_rows = patched2["content"][0]["attrs"]["rows"]
        new_entity_display = new_rows[1]["displayId"]
        self.assertNotEqual(new_entity_display, "#new-row")
        self.assertNotEqual(new_entity_display, keep_display)
        self.assertNotEqual(new_entity_display, remove_display)
        self.assertIsNotNone(new_rows[1]["entityId"])

    def test_multiple_tables_same_schema_do_not_cross_delete(self):
        """Two limsTable nodes sharing the same schema must not delete each
        other's entities — the original bug that caused entity duplication."""
        from workspaces.lims.services import sync_entities

        # Build a doc with TWO limsTable nodes, both using the same schema
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": self.blood_type.id,
                        "title": "Table A",
                        "columns": self.blood_type.columns,
                        "rows": [
                            {
                                "entityId": None,
                                "displayId": "#new",
                                "values": {"volume": "10", "patient": "A"},
                            },
                            {
                                "entityId": None,
                                "displayId": "#new",
                                "values": {"volume": "20", "patient": "B"},
                            },
                        ],
                    },
                },
                {"type": "paragraph"},
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": self.blood_type.id,
                        "title": "Table B",
                        "columns": self.blood_type.columns,
                        "rows": [
                            {
                                "entityId": None,
                                "displayId": "#new",
                                "values": {"volume": "30", "patient": "C"},
                            },
                        ],
                    },
                },
            ],
        }

        # ── First save ──
        patched1 = sync_entities(self.entry, doc)
        self.assertEqual(Entity.objects.count(), 3)

        # Gather entity IDs after first save
        table_a_rows = patched1["content"][0]["attrs"]["rows"]
        table_b_rows = patched1["content"][2]["attrs"]["rows"]
        a1_id = table_a_rows[0]["entityId"]
        a2_id = table_a_rows[1]["entityId"]
        b1_id = table_b_rows[0]["entityId"]

        # ── Second save (no changes — pure round‑trip) ──
        patched2 = sync_entities(self.entry, patched1)

        # Still 3 entities — no cross‑deletion between tables
        self.assertEqual(Entity.objects.count(), 3)

        # All three entities still exist
        for eid in [a1_id, a2_id, b1_id]:
            self.assertTrue(Entity.objects.filter(id=eid).exists(),
                            f"Entity {eid} should survive the second save")

        # Entity IDs are stable across saves
        rows_a2 = patched2["content"][0]["attrs"]["rows"]
        rows_b2 = patched2["content"][2]["attrs"]["rows"]
        self.assertEqual(rows_a2[0]["entityId"], a1_id)
        self.assertEqual(rows_a2[1]["entityId"], a2_id)
        self.assertEqual(rows_b2[0]["entityId"], b1_id)

    def test_multiple_tables_same_schema_row_changes(self):
        """Two tables same schema: add a row to one, remove from the other,
        modify a value in the third — everything survives correctly."""
        from workspaces.lims.services import sync_entities

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": self.blood_type.id,
                        "title": "Table A",
                        "columns": self.blood_type.columns,
                        "rows": [
                            {"entityId": None, "displayId": "#new", "values": {"volume": "10", "patient": "A"}},
                            {"entityId": None, "displayId": "#new", "values": {"volume": "20", "patient": "B"}},
                        ],
                    },
                },
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": self.blood_type.id,
                        "title": "Table B",
                        "columns": self.blood_type.columns,
                        "rows": [
                            {"entityId": None, "displayId": "#new", "values": {"volume": "30", "patient": "C"}},
                            {"entityId": None, "displayId": "#new", "values": {"volume": "40", "patient": "D"}},
                        ],
                    },
                },
            ],
        }

        patched1 = sync_entities(self.entry, doc)
        self.assertEqual(Entity.objects.count(), 4)

        t1_rows = patched1["content"][0]["attrs"]["rows"]
        t2_rows = patched1["content"][1]["attrs"]["rows"]
        keep_id = t1_rows[0]["entityId"]      # Table A row 0 (keep)
        remove_id = t1_rows[1]["entityId"]     # Table A row 1 (remove)
        modify_id = t2_rows[0]["entityId"]     # Table B row 0 (modify)
        keep2_id = t2_rows[1]["entityId"]      # Table B row 1 (keep)

        # ── Second save: remove Table A row 1, modify Table B row 0,
        #    add a new row to Table B ──
        doc2 = patched1
        # Table A: keep only row 0
        doc2["content"][0]["attrs"]["rows"] = [
            {"entityId": keep_id, "displayId": t1_rows[0]["displayId"],
             "values": {"volume": "10", "patient": "A"}},
        ]
        # Table B: modify row 0, keep row 1, add row 2
        doc2["content"][1]["attrs"]["rows"] = [
            {"entityId": modify_id, "displayId": t2_rows[0]["displayId"],
             "values": {"volume": "99", "patient": "C-modified"}},
            {"entityId": keep2_id, "displayId": t2_rows[1]["displayId"],
             "values": {"volume": "40", "patient": "D"}},
            {"entityId": None, "displayId": "#new-row",
             "values": {"volume": "50", "patient": "E"}},
        ]

        patched2 = sync_entities(self.entry, doc2)

        # Net: 4 - 1 (removed) + 1 (added) = 4
        self.assertEqual(Entity.objects.count(), 4)

        # Removed entity is gone
        self.assertFalse(Entity.objects.filter(id=remove_id).exists())

        # Kept entities still exist
        for eid in [keep_id, modify_id, keep2_id]:
            self.assertTrue(Entity.objects.filter(id=eid).exists(),
                            f"Entity {eid} should survive")

        # Modified entity has updated properties
        modified = Entity.objects.get(id=modify_id)
        self.assertEqual(modified.properties["volume"], "99")
        self.assertEqual(modified.properties["patient"], "C-modified")

        # New entity has a real display_id
        new_rows_b = patched2["content"][1]["attrs"]["rows"]
        self.assertIsNotNone(new_rows_b[2]["entityId"])
        self.assertNotEqual(new_rows_b[2]["displayId"], "#new-row")

    def test_sync_deletes_removed_entities(self):
        """Rows removed from the table delete their entities.

        Uses the patched content from the first sync for the second sync,
        matching the real frontend round-trip."""
        from workspaces.lims.services import sync_entities

        # Create two entities
        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "10", "patient": "A"}, {"volume": "20", "patient": "B"}],
            entity_type=self.blood_type,
        )
        patched = sync_entities(self.entry, doc)
        self.assertEqual(Entity.objects.count(), 2)

        kept_row = patched["content"][0]["attrs"]["rows"][0]
        kept_display_id = kept_row["displayId"]
        kept_entity_id = kept_row["entityId"]
        removed_display_id = patched["content"][0]["attrs"]["rows"][1]["displayId"]

        # Second save: only keep the first row (simulating a delete of row 2)
        # Use the patched content as the starting point (real frontend behavior)
        doc2 = patched
        doc2["content"][0]["attrs"]["rows"] = [
            {
                "entityId": kept_entity_id,
                "displayId": kept_display_id,
                "values": {"volume": "10", "patient": "A"},
            }
        ]

        sync_entities(self.entry, doc2)

        self.assertEqual(Entity.objects.count(), 1)
        self.assertEqual(Entity.objects.first().display_id, kept_display_id)
        self.assertFalse(Entity.objects.filter(display_id=removed_display_id).exists())

    def test_sync_skips_plain_tables(self):
        """Tables without schemaId are ignored (plain tables)."""
        from workspaces.lims.services import sync_entities

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "limsTable",
                    "attrs": {
                        "schemaId": None,
                        "title": "Plain Table",
                        "columns": [
                            {"name": "Col A", "type": "Text"},
                        ],
                        "rows": [
                            {"entityId": None, "displayId": "#1", "values": {"Col A": "Hello"}},
                        ],
                    },
                }
            ],
        }

        updated = sync_entities(self.entry, doc)

        self.assertEqual(Entity.objects.count(), 0)
        self.assertEqual(updated, doc)  # unchanged

    def test_sync_empty_table_noop(self):
        """A limsTable with no rows is a no-op."""
        from workspaces.lims.services import sync_entities

        doc = make_lims_table_doc(
            self.blood_type.id, rows_data=[], entity_type=self.blood_type,
        )
        sync_entities(self.entry, doc)

        self.assertEqual(Entity.objects.count(), 0)

    def test_sync_reference_cells_create_mentions(self):
        """Reference-type columns inside limsTable v2 trigger mention sync."""
        from workspaces.lims.services import sync_entities
        from references.services import sync_mentions
        from workspaces.eln.models import Mention

        # Create a target entry to reference
        target = NotebookEntry.objects.create(
            title="Target", content=EMPTY_DOC,
            folder=self.folder, author=self.user,
        )

        # EntityType with a Reference column
        ref_type = EntityType.objects.create(
            name="Ref Type", prefix="REF", columns=[
                {"name": "linked_to", "type": "Reference"},
            ],
        )

        # Table v2 format: reference value is the target's display_id as a plain string
        doc = make_lims_table_doc(
            ref_type.id,
            rows_data=[{"linked_to": target.display_id}],
            entity_type=ref_type,
        )

        # First sync entities, then sync mentions (mimicking the save flow)
        updated = sync_entities(self.entry, doc)
        sync_mentions(self.entry, updated)

        # A Mention should exist from this entry → target
        self.assertEqual(Mention.objects.count(), 1)
        mention = Mention.objects.first()
        self.assertEqual(mention.source_id, self.entry.id)
        self.assertEqual(mention.target_id, target.id)


# ── EntityType.icon field ─────────────────────────────────────────────

class EntityTypeIconTests(TestCase):
    """Tests for the EntityType.icon field."""

    def test_default_icon_is_test_tube(self):
        """EntityType.icon defaults to 🧪."""
        et = EntityType.objects.create(
            name="Default Icon", prefix="DEF", columns=[]
        )
        self.assertEqual(et.icon, "🧪")

    def test_custom_icon_survives_roundtrip(self):
        """Custom icon is persisted and retrieved correctly."""
        et = EntityType.objects.create(
            name="Blood", prefix="BLOOD", icon="🩸", columns=[]
        )
        et.refresh_from_db()
        self.assertEqual(et.icon, "🩸")

    def test_icon_in_serializer(self):
        """EntityTypeSerializer includes the icon field."""
        from workspaces.lims.serializers import EntityTypeSerializer

        et = EntityType.objects.create(
            name="DNA", prefix="DNA", icon="🧬", columns=[]
        )
        serializer = EntityTypeSerializer(et)
        self.assertIn("icon", serializer.data)
        self.assertEqual(serializer.data["icon"], "🧬")
