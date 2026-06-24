"""
Tests for the LIMS services: sync_entities, walk_lims_tables.
"""
from django.test import TestCase

from core.models import Folder, User
from eln.models import NotebookEntry
from lims.models import EntityType, Entity


# ── TipTap document fixtures ──

EMPTY_DOC = {"type": "doc", "content": [{"type": "paragraph"}]}


def make_lims_table_doc(schema_id, rows_data=None, entity_type=None):
    """Build a TipTap doc containing a single limsTable v2 node.

    Args:
        schema_id: PK of the EntityType.
        rows_data: List of dicts with column-name keys, e.g.
            ``[{"volume": "50", "patient": "Alice"}]``.
            If None, an empty rows array is used.
        entity_type: Optional EntityType instance; used to populate
            ``attrs.columns``. If omitted, columns will be empty.

    Each row in ``rows_data`` becomes
    ``{entityId: None, displayId: "#new", values: {...}}``.
    """
    if rows_data is None:
        rows_data = []

    # Derive columns from entity type if provided
    columns = []
    if entity_type is not None:
        columns = entity_type.columns

    rows = [
        {"entityId": None, "displayId": "#new", "values": row}
        for row in rows_data
    ]

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


class SyncEntitiesTests(TestCase):
    """Tracer-bullet + incremental tests for sync_entities()."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.folder = Folder.objects.create(name="Default")
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
        from lims.services import sync_entities

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
        from lims.services import sync_entities

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
        from lims.services import sync_entities

        # First save creates the entity
        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "50", "patient": "Patient A"}],
            entity_type=self.blood_type,
        )
        updated = sync_entities(self.entry, doc)
        entity_display_id = updated["content"][0]["attrs"]["rows"][0]["displayId"]
        self.assertEqual(Entity.objects.count(), 1)

        # Second save with different cell values (keep same displayId so it updates)
        doc2 = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "75", "patient": "Patient B"}],
            entity_type=self.blood_type,
        )
        # Inject the known displayId so the backend finds the existing entity
        doc2["content"][0]["attrs"]["rows"][0]["entityId"] = Entity.objects.first().id
        doc2["content"][0]["attrs"]["rows"][0]["displayId"] = entity_display_id

        sync_entities(self.entry, doc2)

        entity = Entity.objects.get(display_id=entity_display_id)
        self.assertEqual(entity.properties, {"volume": "75", "patient": "Patient B"})

    def test_sync_deletes_removed_entities(self):
        """Rows removed from the table delete their entities."""
        from lims.services import sync_entities

        # Create two entities
        doc = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "10", "patient": "A"}, {"volume": "20", "patient": "B"}],
            entity_type=self.blood_type,
        )
        updated = sync_entities(self.entry, doc)
        self.assertEqual(Entity.objects.count(), 2)

        # Keep only the first row's displayId
        kept_display_id = updated["content"][0]["attrs"]["rows"][0]["displayId"]
        doc2 = make_lims_table_doc(
            self.blood_type.id,
            rows_data=[{"volume": "10", "patient": "A"}],
            entity_type=self.blood_type,
        )
        doc2["content"][0]["attrs"]["rows"][0]["entityId"] = Entity.objects.first().id
        doc2["content"][0]["attrs"]["rows"][0]["displayId"] = kept_display_id

        sync_entities(self.entry, doc2)

        self.assertEqual(Entity.objects.count(), 1)
        self.assertEqual(Entity.objects.first().display_id, kept_display_id)

    def test_sync_skips_plain_tables(self):
        """Tables without schemaId are ignored (plain tables)."""
        from lims.services import sync_entities

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
        from lims.services import sync_entities

        doc = make_lims_table_doc(
            self.blood_type.id, rows_data=[], entity_type=self.blood_type,
        )
        sync_entities(self.entry, doc)

        self.assertEqual(Entity.objects.count(), 0)

    def test_sync_reference_cells_create_mentions(self):
        """Reference-type columns inside limsTable v2 trigger mention sync."""
        from lims.services import sync_entities
        from references.services import sync_mentions
        from eln.models import Mention

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
