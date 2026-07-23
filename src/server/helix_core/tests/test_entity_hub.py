"""Tests for the Entity Hub VIEW and API endpoint.

Tests the entity_hub_view PostgreSQL VIEW (UNION ALL across entity
tables) and the GET /api/registry/entities endpoint.
"""

from django.test import TestCase
from rest_framework.test import APITestCase

from core.models import Folder, User
from helix_core.models import Schema, SchemaType


# ── Helpers ───────────────────────────────────────────────────────────────


def _setup_schema_types():
    """Create the two SchemaTypes and their default Schemas."""
    eln_type = SchemaType.objects.create(
        display_name="Entry",
        workspace_id="eln",
        model="mods.eln.models.NotebookEntry",
    )
    lims_type = SchemaType.objects.create(
        display_name="LIMS Entity",
        workspace_id="lims",
        model="mods.lims.models.Entity",
    )
    eln_schema = Schema.objects.create(
        name="Default",
        prefix="E",
        schema_type=eln_type,
        is_default=True,
    )
    lims_schema = Schema.objects.create(
        name="Default",
        prefix="LIMS",
        schema_type=lims_type,
        is_default=True,
    )
    return eln_type, lims_type, eln_schema, lims_schema


# ── Entity Hub VIEW tests ──────────────────────────────────────────────────


class EntityHubViewTests(TestCase):
    """Test the entity_hub_view PostgreSQL VIEW."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="testuser", password="pass"
        )
        _, _, eln_schema, lims_schema = _setup_schema_types()

        from mods.eln.models import NotebookEntry
        from mods.lims.models import Entity

        cls.eln_entry = NotebookEntry.objects.create(
            name="ELN Test Entry",
            author=cls.user,
            schema=eln_schema,
            content={"type": "doc", "content": []},
        )
        cls.lims_entity = Entity.objects.create(
            name="LIMS Test Entity",
            author=cls.user,
            schema=lims_schema,
        )

    def test_view_returns_rows_from_both_tables(self):
        """The VIEW returns rows from both eln_entry and lims_entity."""
        from helix_core.models import EntityHubView

        rows = list(EntityHubView.objects.all().order_by("id"))
        self.assertGreaterEqual(len(rows), 2)

        schema_type_ids = {r.schema_type_id for r in rows}
        self.assertIn("eln.entry", schema_type_ids)
        self.assertIn("lims.entity", schema_type_ids)

    def test_view_includes_workspace_id_column(self):
        """Each row carries a workspace_id computed column."""
        from helix_core.models import EntityHubView

        rows = list(EntityHubView.objects.all().order_by("schema_type_id"))
        workspace_ids = {r.workspace_id for r in rows}
        self.assertIn("eln", workspace_ids)
        self.assertIn("lims", workspace_ids)

    def test_view_includes_common_columns(self):
        """Each row includes the common entity columns (name, display_id, etc.)."""
        from helix_core.models import EntityHubView

        row = EntityHubView.objects.filter(
            schema_type_id="eln.entry"
        ).first()
        self.assertIsNotNone(row)
        self.assertEqual(row.name, "ELN Test Entry")
        self.assertIsNotNone(row.display_id)
        self.assertIsNotNone(row.status)
        self.assertIsNotNone(row.created_at)
        self.assertIsNotNone(row.updated_at)

    def test_view_schema_type_id_matches_union_branch(self):
        """schema_type_id matches the UNION ALL branch."""
        from helix_core.models import EntityHubView

        row = EntityHubView.objects.filter(
            schema_type_id="lims.entity"
        ).first()
        self.assertIsNotNone(row)
        self.assertEqual(row.schema_type_id, "lims.entity")

    def test_view_is_read_only(self):
        """The VIEW is read-only — writes should fail."""
        from helix_core.models import EntityHubView

        with self.assertRaises(Exception):
            EntityHubView.objects.create(
                name="test",
                display_id="X1",
                author=self.user,
                status="in_progress",
                schema_type_id="eln.entry",
                workspace_id="eln",
            )


# ── Entity Hub API endpoint tests ──────────────────────────────────────────


class EntityHubAPITests(APITestCase):
    """Test GET /api/registry/entities/."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="testuser", password="pass"
        )
        _, _, eln_schema, lims_schema = _setup_schema_types()

        from mods.eln.models import NotebookEntry
        from mods.lims.models import Entity

        cls.eln_entry = NotebookEntry.objects.create(
            name="ELN Test Entry",
            author=cls.user,
            schema=eln_schema,
            content={"type": "doc", "content": []},
        )
        cls.lims_entity = Entity.objects.create(
            name="LIMS Test Entity",
            author=cls.user,
            schema=lims_schema,
        )
        cls.url = "/api/registry/entities/"

    def test_list_returns_paginated_results(self):
        """Default GET returns paginated results with expected envelope fields."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("results", data)
        self.assertIn("total", data)
        self.assertIn("page", data)
        self.assertIn("size", data)
        self.assertIn("available_columns", data)

    def test_list_returns_all_entities(self):
        """Without filters, the endpoint returns all entities from both tables."""
        response = self.client.get(self.url)
        data = response.json()
        self.assertGreaterEqual(data["total"], 2)
        display_ids = {r["display_id"] for r in data["results"]}
        self.assertIn(self.eln_entry.display_id, display_ids)
        self.assertIn(self.lims_entity.display_id, display_ids)

    def test_each_row_has_workspace_id(self):
        """Each row in results carries a workspace_id."""
        response = self.client.get(self.url)
        data = response.json()
        for row in data["results"]:
            self.assertIn("workspace_id", row)
            self.assertIn(row["workspace_id"], ["eln", "lims"])

    def test_each_row_has_expected_fields(self):
        """Each row has display_id, name, schema_type_id, status, author_username."""
        response = self.client.get(self.url)
        data = response.json()
        for row in data["results"]:
            self.assertIn("display_id", row)
            self.assertIn("name", row)
            self.assertIn("schema_type_id", row)
            self.assertIn("schema_type_display", row)
            self.assertIn("status", row)
            self.assertIn("author_username", row)

    def test_default_page_size_is_50(self):
        """The default page size is 50."""
        response = self.client.get(self.url)
        data = response.json()
        self.assertEqual(data["size"], 50)

    def test_page_size_can_be_customized(self):
        """The size query parameter controls page size."""
        response = self.client.get(f"{self.url}?size=2")
        data = response.json()
        self.assertEqual(data["size"], 2)

    def test_page_param_selects_page(self):
        """The page query parameter selects a specific page."""
        # Create enough entities to span multiple pages at size=1
        from mods.lims.models import Entity
        from helix_core.models import Schema

        schema = Schema.objects.get(prefix="LIMS")
        for i in range(3):
            Entity.objects.create(
                name=f"Extra {i}",
                author=self.user,
                schema=schema,
            )

        # Page 1 at size=2
        response = self.client.get(f"{self.url}?size=2&page=1")
        data = response.json()
        self.assertEqual(data["page"], 1)
        self.assertEqual(len(data["results"]), 2)

        # Page 2 at size=2
        response = self.client.get(f"{self.url}?size=2&page=2")
        data = response.json()
        self.assertEqual(data["page"], 2)
        self.assertGreater(len(data["results"]), 0)

    def test_available_columns_includes_common_columns(self):
        """available_columns lists the default common columns."""
        response = self.client.get(self.url)
        data = response.json()
        columns = data["available_columns"]
        keys = {c["key"] for c in columns}
        expected = {"display_id", "name", "schema_type_id", "status",
                     "author", "created_at", "updated_at"}
        self.assertTrue(expected.issubset(keys))

    def test_empty_database_returns_empty_results(self):
        """When no entities exist, results is empty (not an error)."""
        from mods.eln.models import NotebookEntry
        from mods.lims.models import Entity
        NotebookEntry.objects.all().delete()
        Entity.objects.all().delete()

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total"], 0)
        self.assertEqual(len(data["results"]), 0)
