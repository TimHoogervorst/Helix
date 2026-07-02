"""
Tests for the LIMS API endpoints.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from core.tests.base import BaseTestCase
from workspaces.lims.models import EntityType, Entity


class LimsApiTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        EntityType.objects.create(name="DNA", prefix="DNA", columns=[])
        EntityType.objects.create(name="Chemical", prefix="CHEM", columns=[])

    def test_list_entity_types(self):
        """GET returns the seeded types."""
        response = self.client.get("/api/lims/entity-types/")
        self.assertEqual(response.status_code, 200)
        names = {et["name"] for et in response.data}
        self.assertIn("DNA", names)
        self.assertIn("Chemical", names)

    def test_list_entities_empty(self):
        """GET returns empty list."""
        response = self.client.get("/api/lims/entities/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_create_entity_succeeds(self):
        """POST creates an entity with auto-generated display_id."""
        self.client.force_authenticate(user=self.user)
        dna_type = EntityType.objects.get(name="DNA")
        response = self.client.post(
            "/api/lims/entities/",
            {"name": "Sample A", "entity_type": dna_type.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Sample A")
        self.assertTrue(response.data["display_id"].startswith("DNA"))


# ── Slice 1: EntityType CRUD ──

class EntityTypeCrudTests(TestCase):
    """Full CRUD for EntityType: create, update, soft-delete."""

    def setUp(self):
        self.client = APIClient()

    def test_create_entity_type(self):
        """POST creates a schema with name, prefix, and columns."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {
                "name": "Blood Sample",
                "prefix": "BLOOD",
                "columns": [
                    {"name": "volume", "type": "Number", "required": True},
                    {"name": "patient", "type": "Text", "required": False},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Blood Sample")
        self.assertEqual(response.data["prefix"], "BLOOD")
        self.assertEqual(len(response.data["columns"]), 2)
        self.assertTrue(response.data["is_active"])

        # Verify it's persisted
        et = EntityType.objects.get(pk=response.data["id"])
        self.assertEqual(et.prefix, "BLOOD")
        self.assertEqual(len(et.columns), 2)

    def test_create_entity_type_without_prefix_fails(self):
        """POST without prefix returns 400."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {"name": "No Prefix", "columns": []},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_create_entity_type_duplicate_prefix_fails(self):
        """POST with a prefix already in use returns 400."""
        EntityType.objects.create(name="First", prefix="UNIQ", columns=[])
        response = self.client.post(
            "/api/lims/entity-types/",
            {"name": "Second", "prefix": "UNIQ", "columns": []},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_update_entity_type(self):
        """PUT updates a schema's name, columns, and reorder."""
        et = EntityType.objects.create(name="DNA", prefix="DNA", columns=[
            {"name": "vol", "type": "Number"},
        ])
        response = self.client.put(
            f"/api/lims/entity-types/{et.id}/",
            {
                "name": "DNA Updated",
                "prefix": "DNA",  # unchanged
                "columns": [
                    {"name": "conc", "type": "Number"},
                    {"name": "vol", "type": "Number"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "DNA Updated")
        self.assertEqual(len(response.data["columns"]), 2)
        self.assertEqual(response.data["columns"][0]["name"], "conc")

        et.refresh_from_db()
        self.assertEqual(et.name, "DNA Updated")
        self.assertEqual(len(et.columns), 2)

    def test_soft_delete_entity_type(self):
        """DELETE sets is_active=False instead of hard-deleting."""
        et = EntityType.objects.create(name="Temp", prefix="TEMP", columns=[])
        self.assertTrue(et.is_active)

        response = self.client.delete(f"/api/lims/entity-types/{et.id}/")
        self.assertEqual(response.status_code, 204)

        et.refresh_from_db()
        self.assertFalse(et.is_active)

        # Still exists in DB
        self.assertTrue(EntityType.objects.filter(pk=et.id).exists())


class EntityTypeColumnValidationTests(TestCase):
    """Column schema validation on EntityType create/update."""

    def setUp(self):
        self.client = APIClient()

    def test_rejects_invalid_column_type(self):
        """POST with a column type outside allowed set returns 400."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {
                "name": "Bad Schema",
                "prefix": "BAD",
                "columns": [
                    {"name": "foo", "type": "InvalidType"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("columns", response.data)

    def test_rejects_prefix_with_lowercase(self):
        """POST with lowercase prefix returns 400."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {
                "name": "Bad Prefix",
                "prefix": "blood",  # lowercase
                "columns": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    # ── Name pseudo-column rejection ─────────────────────────────────

    def test_rejects_column_named_name(self):
        """POST with a column named 'name' returns 400."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {
                "name": "Test Schema",
                "prefix": "TEST",
                "columns": [
                    {"name": "name", "type": "Text"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("columns", response.data)

    def test_rejects_column_named_NAME_uppercase(self):
        """POST with a column named 'NAME' (uppercase) returns 400."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {
                "name": "Test Schema",
                "prefix": "TEST",
                "columns": [
                    {"name": "NAME", "type": "Text"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_column_named_name_with_whitespace(self):
        """POST with a column named ' Name ' (whitespace) returns 400."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {
                "name": "Test Schema",
                "prefix": "TEST",
                "columns": [
                    {"name": " Name ", "type": "Text"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_column_named_name_mixed_case(self):
        """POST with a column named 'nAmE' (mixed case) returns 400."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {
                "name": "Test Schema",
                "prefix": "TEST",
                "columns": [
                    {"name": "nAmE", "type": "Text"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_allows_columns_not_named_name(self):
        """POST with columns not named 'name' succeeds."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {
                "name": "Valid Schema",
                "prefix": "VALID",
                "columns": [
                    {"name": "volume", "type": "Number"},
                    {"name": "description", "type": "Text"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

    def test_put_rejects_column_named_name_on_update(self):
        """PUT with a column named 'Name' on update returns 400."""
        et = EntityType.objects.create(
            name="DNA", prefix="DNA",
            columns=[{"name": "vol", "type": "Number"}],
        )
        response = self.client.put(
            f"/api/lims/entity-types/{et.id}/",
            {
                "name": "DNA",
                "prefix": "DNA",
                "columns": [
                    {"name": "vol", "type": "Number"},
                    {"name": "Name", "type": "Text"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


# ── Slice 2: Entity API ──

class EntityApiTests(BaseTestCase):
    """Entity listing, detail (by display_id), and batch resolve."""

    def setUp(self):
        super().setUp()
        self.dna_type = EntityType.objects.create(name="DNA", prefix="DNA", columns=[
            {"name": "concentration", "type": "Number"},
        ])
        self.chem_type = EntityType.objects.create(name="Chemical", prefix="CHEM", columns=[
            {"name": "purity", "type": "Text"},
        ])

    def test_list_entities_with_filters(self):
        """GET /api/lims/entities/ supports ?search= and ?type= filters."""
        e1 = Entity.objects.create(
            name="Sample Alpha", entity_type=self.dna_type,
            folder=self.folder, created_by=self.user,
            properties={"concentration": 42},
        )
        e2 = Entity.objects.create(
            name="Reagent Beta", entity_type=self.chem_type,
            folder=self.folder, created_by=self.user,
            properties={"purity": "High"},
        )

        # Filter by type
        response = self.client.get(f"/api/lims/entities/?type={self.dna_type.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["display_id"], e1.display_id)

        # Search by name
        response = self.client.get("/api/lims/entities/?search=Beta")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["name"], "Reagent Beta")

        # Search by display_id
        response = self.client.get(f"/api/lims/entities/?search={e2.display_id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_retrieve_entity_by_display_id(self):
        """GET /api/lims/entities/{display_id}/ looks up by display_id, not pk."""
        entity = Entity.objects.create(
            name="Retrieve Me", entity_type=self.dna_type,
            folder=self.folder, created_by=self.user,
        )
        response = self.client.get(f"/api/lims/entities/{entity.display_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["display_id"], entity.display_id)
        self.assertEqual(response.data["name"], "Retrieve Me")

    def test_retrieve_by_numeric_pk_returns_404(self):
        """GET by numeric pk returns 404 (lookup is by display_id, not pk)."""
        entity = Entity.objects.create(
            name="By PK", entity_type=self.dna_type,
            folder=self.folder, created_by=self.user,
        )
        response = self.client.get(f"/api/lims/entities/{entity.pk}/")
        self.assertEqual(response.status_code, 404)

    def test_batch_resolve_entities(self):
        """POST /api/lims/entities/batch/ resolves display IDs to properties."""
        e1 = Entity.objects.create(
            name="Batch One", entity_type=self.dna_type,
            folder=self.folder, created_by=self.user,
            properties={"concentration": 99},
        )
        e2 = Entity.objects.create(
            name="Batch Two", entity_type=self.chem_type,
            folder=self.folder, created_by=self.user,
            properties={"purity": "Low"},
        )

        response = self.client.post(
            "/api/lims/entities/batch/",
            {"ids": [e1.display_id, e2.display_id, "NONEXIST1"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(e1.display_id, response.data)
        self.assertEqual(response.data[e1.display_id]["name"], "Batch One")
        self.assertEqual(response.data[e1.display_id]["properties"]["concentration"], 99)
        self.assertEqual(response.data[e2.display_id]["name"], "Batch Two")
        self.assertIsNone(response.data["NONEXIST1"])
