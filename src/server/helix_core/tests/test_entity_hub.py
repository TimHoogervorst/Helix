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
        display_name="Entity",
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
        self.assertIn("eln.notebookentry", schema_type_ids)
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
            schema_type_id="eln.notebookentry"
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
                schema_type_id="eln.notebookentry",
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
        expected = {"display_id", "name", "schema_type_id", "project",
                     "folder", "status", "author", "created_at", "updated_at"}
        self.assertTrue(expected.issubset(keys))

    def test_available_columns_have_type_filterable_width(self):
        """Every available_column entry carries type, filterable, and width."""
        response = self.client.get(self.url)
        data = response.json()
        for col in data["available_columns"]:
            self.assertIn("type", col)
            self.assertIn("filterable", col)
            self.assertIn("width", col)
            self.assertIsInstance(col["type"], str)
            self.assertIsInstance(col["filterable"], bool)
            # width is None until rendering is wired
            self.assertIsNone(col["width"])

    def test_available_columns_type_ids_are_lowercase(self):
        """Common columns use lowercase type IDs from the registry."""
        response = self.client.get(self.url)
        data = response.json()
        type_by_key = {c["key"]: c["type"] for c in data["available_columns"]}
        self.assertEqual(type_by_key.get("display_id"), "text")
        self.assertEqual(type_by_key.get("name"), "text")
        self.assertEqual(type_by_key.get("status"), "dropdown")
        self.assertEqual(type_by_key.get("author"), "user")
        self.assertEqual(type_by_key.get("created_at"), "datetime")
        self.assertEqual(type_by_key.get("updated_at"), "datetime")

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

    # ── Search filter ────────────────────────────────────────────────────

    def test_search_by_name(self):
        """?search= filters by name (case-insensitive)."""
        response = self.client.get(f"{self.url}?search=ELN Test")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreaterEqual(data["total"], 1)
        names = [r["name"] for r in data["results"]]
        self.assertIn("ELN Test Entry", names)

    def test_search_by_display_id(self):
        """?search= filters by display_id (case-insensitive)."""
        response = self.client.get(
            f"{self.url}?search={self.eln_entry.display_id}"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreaterEqual(data["total"], 1)

    # ── Schema type filter ───────────────────────────────────────────────

    def test_filter_by_schema_type(self):
        """?schema_type= filters to entities of that type."""
        response = self.client.get(f"{self.url}?schema_type=eln.notebookentry")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for row in data["results"]:
            self.assertEqual(row["schema_type_id"], "eln.notebookentry")

    def test_filter_by_schema_type_lims(self):
        """?schema_type=lims.entity returns only LIMS entities."""
        response = self.client.get(f"{self.url}?schema_type=lims.entity")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for row in data["results"]:
            self.assertEqual(row["schema_type_id"], "lims.entity")

    # ── Schema filter ────────────────────────────────────────────────────

    def test_filter_by_schema_id(self):
        """?schema= filters to entities with that specific schema."""
        from helix_core.models import Schema
        eln_schema = Schema.objects.get(prefix="E")
        response = self.client.get(f"{self.url}?schema={eln_schema.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for row in data["results"]:
            self.assertEqual(row["schema_id"], eln_schema.id)

    # ── Status filter ────────────────────────────────────────────────────

    def test_filter_by_status_in_progress(self):
        """?status=in_progress returns only in-progress entities."""
        response = self.client.get(f"{self.url}?status=in_progress")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for row in data["results"]:
            self.assertEqual(row["status"], "in_progress")

    def test_filter_by_status_finished(self):
        """?status=finished returns only finished entities."""
        # Create a finished entity
        from mods.lims.models import Entity
        from helix_core.models import Schema
        lims_schema = Schema.objects.get(prefix="LIMS")
        Entity.objects.create(
            name="Finished Entity",
            author=self.user,
            schema=lims_schema,
            status="finished",
        )
        response = self.client.get(f"{self.url}?status=finished")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for row in data["results"]:
            self.assertEqual(row["status"], "finished")

    # ── Sort ─────────────────────────────────────────────────────────────

    def test_sort_by_name_ascending(self):
        """?sort=name sorts results by name ascending."""
        response = self.client.get(f"{self.url}?sort=name")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = [r["name"] for r in data["results"]]
        self.assertEqual(names, sorted(names))

    def test_sort_by_updated_at_descending(self):
        """?sort=-updated_at sorts by most recently updated first."""
        response = self.client.get(f"{self.url}?sort=-updated_at")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        if len(data["results"]) >= 2:
            dates = [r["updated_at"] for r in data["results"]]
            self.assertEqual(dates, sorted(dates, reverse=True))

    # ── Field filters ────────────────────────────────────────────────────

    def test_field_filter(self):
        """?f=key:value filters on properties JSON column."""
        from mods.lims.models import Entity
        from helix_core.models import Schema
        lims_schema = Schema.objects.get(prefix="LIMS")
        Entity.objects.create(
            name="Blood Sample A",
            author=self.user,
            schema=lims_schema,
            properties={"sample_type": "A"},
        )
        Entity.objects.create(
            name="Blood Sample B",
            author=self.user,
            schema=lims_schema,
            properties={"sample_type": "B"},
        )
        response = self.client.get(f"{self.url}?f=sample_type:B")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["results"][0]["name"], "Blood Sample B")

    # ── Combined filters ─────────────────────────────────────────────────

    def test_combined_search_and_status(self):
        """Multiple filters combine with AND logic."""
        response = self.client.get(
            f"{self.url}?search=ELN&status=in_progress"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for row in data["results"]:
            self.assertEqual(row["status"], "in_progress")
            self.assertIn("ELN", row["name"].upper())

    def test_combined_schema_type_and_sort(self):
        """Schema type filter + sort can be combined."""
        response = self.client.get(
            f"{self.url}?schema_type=eln.notebookentry&sort=name"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = [r["name"] for r in data["results"]]
        self.assertEqual(names, sorted(names))
        for row in data["results"]:
            self.assertEqual(row["schema_type_id"], "eln.notebookentry")

    def test_combined_search_and_schema_scopes_results(self):
        """?search= + ?schema= scopes search results to that schema."""
        from mods.lims.models import Entity
        from helix_core.models import Schema, SchemaType

        lims_type = SchemaType.objects.get(workspace_id="lims")
        extra_schema = Schema.objects.create(
            name="Special Scheme", prefix="D", schema_type=lims_type,
            is_default=False,
        )
        Entity.objects.create(
            name="Unique Zebra Fish", schema=extra_schema,
            author=self.user,
        )

        response = self.client.get(
            f"{self.url}?search=Zebra&schema={extra_schema.id}"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["results"][0]["name"], "Unique Zebra Fish")

        # Without the schema param the same search still finds the entity
        response2 = self.client.get(f"{self.url}?search=Zebra")
        self.assertEqual(response2.status_code, 200)
        data2 = response2.json()
        names2 = [r["name"] for r in data2["results"]]
        self.assertIn("Unique Zebra Fish", names2)

    def test_combined_search_and_wrong_schema_returns_empty(self):
        """?search= + ?schema= with a non-matching schema returns no results."""
        from helix_core.models import Schema

        lims_schema = Schema.objects.get(prefix="LIMS")
        response = self.client.get(
            f"{self.url}?search=LIMS Test Entity&schema={lims_schema.id}"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        if data["total"] > 0:
            for row in data["results"]:
                self.assertEqual(row["schema_id"], lims_schema.id)
                self.assertIn("LIMS", row["name"])

    # ── Project and Folder fields on hub rows ─────────────────────────────

    def test_hub_rows_include_project_and_folder_fields(self):
        """Hub rows carry project_id, project_uid, project_name and folder fields."""
        from core.models import Project
        proj = Project.objects.create(name="Test Project")
        from mods.lims.models import Entity
        from helix_core.models import Schema, SchemaType
        lims_type = SchemaType.objects.get(workspace_id="lims")
        schema = Schema.objects.create(
            name="Proj Schema", prefix="PS", schema_type=lims_type,
            is_default=False,
        )
        Entity.objects.create(
            name="Project Entity", author=self.user, schema=schema,
            project=proj,
        )
        response = self.client.get(self.url)
        data = response.json()
        for row in data["results"]:
            self.assertIn("project_id", row)
            self.assertIn("project_uid", row)
            self.assertIn("project_name", row)
            self.assertIn("project_icon", row)
            self.assertIn("project_color", row)
            self.assertIn("folder_id", row)
            self.assertIn("folder_name", row)
            self.assertIn("folder_path", row)

    def test_sort_by_project_name(self):
        """?sort=project__name sorts by project name."""
        from core.models import Project
        proj_a = Project.objects.create(name="Alpha Project")
        proj_b = Project.objects.create(name="Beta Project")
        from mods.lims.models import Entity
        from helix_core.models import Schema, SchemaType
        lims_type = SchemaType.objects.get(workspace_id="lims")
        schema = Schema.objects.create(
            name="Sort Schema", prefix="SS", schema_type=lims_type,
            is_default=False,
        )
        Entity.objects.create(
            name="Entity B", author=self.user, schema=schema, project=proj_b,
        )
        Entity.objects.create(
            name="Entity A", author=self.user, schema=schema, project=proj_a,
        )
        response = self.client.get(f"{self.url}?sort=project__name&schema_type=lims.entity")
        data = response.json()
        project_names = [
            r["project_name"] for r in data["results"]
            if r["project_name"]
        ]
        self.assertEqual(project_names, sorted(project_names))

    # ── available_columns dynamic expansion ──────────────────────────────

    def test_available_columns_with_schema_includes_schema_columns(self):
        """When ?schema= is set, available_columns includes schema columns."""
        from helix_core.models import Schema
        eln_schema = Schema.objects.get(prefix="E")
        response = self.client.get(f"{self.url}?schema={eln_schema.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        keys = {c["key"] for c in data["available_columns"]}
        # Should still include common columns
        self.assertIn("display_id", keys)
        self.assertIn("name", keys)

    def test_available_columns_with_schema_uses_column_name_as_key(self):
        """available_columns keys use column name (not UUID) to match properties."""
        from helix_core.models import Schema, SchemaType
        lims_type = SchemaType.objects.get(workspace_id="lims")
        schema = Schema.objects.create(
            name="Blood Schema",
            prefix="BLOOD2",
            schema_type=lims_type,
            is_default=False,
            columns=[
                {"name": "sample_type", "type": "text"},
                {"name": "concentration", "type": "number"},
            ],
        )
        response = self.client.get(f"{self.url}?schema={schema.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        schema_keys = {
            c["key"] for c in data["available_columns"] if c["source"] == "schema"
        }
        self.assertEqual(schema_keys, {"sample_type", "concentration"})

    # ── _expanded population ────────────────────────────────────────────

    def test_expanded_populated_when_schema_selected(self):
        """_expanded is populated with column values when ?schema= is set."""
        from helix_core.models import Schema, SchemaType
        from mods.lims.models import Entity

        lims_type = SchemaType.objects.get(workspace_id="lims")
        schema = Schema.objects.create(
            name="Blood Schema",
            prefix="BLOOD3",
            schema_type=lims_type,
            is_default=False,
            columns=[
                {"name": "sample_type", "type": "text"},
                {"name": "concentration", "type": "number"},
            ],
        )
        Entity.objects.create(
            name="Blood Sample X",
            author=self.user,
            schema=schema,
            properties={"sample_type": "Whole Blood", "concentration": 42},
        )

        response = self.client.get(f"{self.url}?schema={schema.id}")
        self.assertEqual(response.status_code, 200)
        row = response.json()["results"][0]
        self.assertEqual(row["schema_id"], schema.id)
        self.assertIsNotNone(row["_expanded"])
        self.assertEqual(row["_expanded"]["sample_type"], "Whole Blood")
        self.assertEqual(row["_expanded"]["concentration"], 42)

    def test_expanded_null_when_no_schema_selected(self):
        """_expanded is null when no schema filter is active."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        for row in response.json()["results"]:
            self.assertIsNone(row["_expanded"])

    def test_expanded_partial_when_some_properties_missing(self):
        """_expanded only includes keys present in properties."""
        from helix_core.models import Schema, SchemaType
        from mods.lims.models import Entity

        lims_type = SchemaType.objects.get(workspace_id="lims")
        schema = Schema.objects.create(
            name="Partial Schema",
            prefix="PART",
            schema_type=lims_type,
            is_default=False,
            columns=[
                {"name": "known_field", "type": "text"},
                {"name": "unknown_field", "type": "text"},
            ],
        )
        Entity.objects.create(
            name="Partial Entity",
            author=self.user,
            schema=schema,
            properties={"known_field": "present"},
        )

        response = self.client.get(f"{self.url}?schema={schema.id}")
        self.assertEqual(response.status_code, 200)
        row = response.json()["results"][0]
        self.assertIsNotNone(row["_expanded"])
        self.assertEqual(row["_expanded"]["known_field"], "present")
        # unknown_field was not set on the entity, so it should be absent
        self.assertNotIn("unknown_field", row["_expanded"])
