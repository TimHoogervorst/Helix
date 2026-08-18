"""
Tests for the Schema and SchemaType API endpoints.
"""
from importlib import import_module

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import User
from helix_core.models import SchemaType, Schema
from mods.access.models import Organization, OrganizationMembership, OrganizationRole


def make_admin(user):
    org = Organization.objects.create(name="Test Lab")
    OrganizationMembership.objects.update_or_create(
        user=user,
        defaults={"organization": org, "role": OrganizationRole.ADMIN},
    )


class SchemaTypeApiTests(TestCase):
    """Tests for the read-only SchemaType list endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="pass")
        make_admin(self.user)
        self.client.force_authenticate(user=self.user)
        SchemaType.objects.create(
            display_name="Entity", workspace_id="lims",
            model="mods.lims.models.Entity",
            tags=["RegistrationTable"],
        )
        SchemaType.objects.create(
            display_name="ELN Entry", workspace_id="eln",
            model="mods.eln.models.NotebookEntry", is_active=False,
        )

    def test_list_schema_types(self):
        """GET returns only active schema types."""
        response = self.client.get("/api/schema-types/")
        self.assertEqual(response.status_code, 200)
        # Only active types are returned
        names = {st["display_name"] for st in response.data}
        self.assertIn("Entity", names)
        self.assertNotIn("ELN Entry", names)
        entity = next(st for st in response.data if st["display_name"] == "Entity")
        self.assertEqual(entity["tags"], ["RegistrationTable"])

    def test_migration_seeds_schema_type_tags(self):
        """The data migration assigns table capability tags by model identity."""
        lims = SchemaType.objects.create(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
        )
        eln = SchemaType.objects.create(
            display_name="ELN Entry",
            workspace_id="eln",
            model="mods.eln.models.NotebookEntry",
            tags=["RegistrationTable"],
        )

        class Apps:
            @staticmethod
            def get_model(app_label, model_name):
                assert app_label == "helix_core"
                assert model_name == "SchemaType"
                return SchemaType

        import_module(
            "helix_core.migrations.0011_schema_type_tags"
        ).seed_schema_type_tags(Apps(), None)

        lims.refresh_from_db()
        eln.refresh_from_db()
        self.assertEqual(lims.tags, ["RegistrationTable"])
        self.assertEqual(eln.tags, [])


class SchemaCrudTests(TestCase):
    """Full CRUD for Schema: create, list, update, soft-delete."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="pass")
        make_admin(self.user)
        self.client.force_authenticate(user=self.user)
        self.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims",
            model="mods.lims.models.Entity",
            tags=["RegistrationTable"],
        )

    def test_create_schema(self):
        """POST creates a schema with name, prefix, schema_type, and columns."""
        response = self.client.post(
            "/api/schemas/",
            {
                "name": "Blood Sample",
                "prefix": "BLOOD",
                "schema_type": self.schema_type.id,
                "columns": [
                    {"name": "volume", "type": "number", "required": True},
                    {"name": "patient", "type": "text", "required": False},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Blood Sample")
        self.assertEqual(response.data["prefix"], "BLOOD")
        self.assertEqual(response.data["schema_type"], self.schema_type.id)
        self.assertEqual(response.data["schema_type_display"], "Entity")
        self.assertEqual(response.data["tags"], ["RegistrationTable"])
        self.assertEqual(len(response.data["columns"]), 2)
        self.assertTrue(response.data["is_active"])
        self.assertFalse(response.data["is_default"])

        # Verify it's persisted
        s = Schema.objects.get(pk=response.data["id"])
        self.assertEqual(s.prefix, "BLOOD")
        self.assertEqual(len(s.columns), 2)
        self.assertIsNotNone(s.content_hash)

    def test_schema_column_metadata_round_trips(self):
        columns = [
            {
                "name": "source",
                "type": "reference",
                "referenceSchemaTypeId": self.schema_type.id,
            },
        ]
        response = self.client.post(
            "/api/schemas/",
            {
                "name": "Referenced",
                "prefix": "REF",
                "schema_type": self.schema_type.id,
                "columns": columns,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            [
                {key: value for key, value in column.items() if key != "id"}
                for column in response.data["columns"]
            ],
            columns,
        )
        retrieved = self.client.get(f"/api/schemas/{response.data['id']}/")
        self.assertEqual(retrieved.status_code, 200)
        self.assertEqual(retrieved.data["columns"], response.data["columns"])

    def test_list_schemas(self):
        """GET returns all schemas with schema type info."""
        Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )
        Schema.objects.create(
            name="Chemical", prefix="CHEM", schema_type=self.schema_type,
        )
        response = self.client.get("/api/schemas/")
        self.assertEqual(response.status_code, 200)
        names = {s["name"] for s in response.data}
        self.assertIn("DNA", names)
        self.assertIn("Chemical", names)
        # Each schema should have schema_type_display
        for s in response.data:
            self.assertEqual(s["schema_type_display"], "Entity")

    def test_retrieve_schema(self):
        """GET returns a single schema."""
        s = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )
        response = self.client.get(f"/api/schemas/{s.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "DNA")
        self.assertEqual(response.data["schema_type_display"], "Entity")

    def test_update_schema(self):
        """PUT updates an existing schema."""
        s = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )
        response = self.client.put(
            f"/api/schemas/{s.id}/",
            {
                "name": "DNA Modified",
                "prefix": "DNA",
                "schema_type": self.schema_type.id,
                "columns": [{"name": "concentration", "type": "number"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "DNA Modified")
        self.assertEqual(len(response.data["columns"]), 1)

    def test_soft_delete_schema(self):
        """DELETE sets is_active=False instead of removing the row."""
        s = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )
        response = self.client.delete(f"/api/schemas/{s.id}/")
        self.assertEqual(response.status_code, 204)
        s.refresh_from_db()
        self.assertFalse(s.is_active)

    def test_create_schema_without_schema_type_fails(self):
        """POST without schema_type returns 400."""
        response = self.client.post(
            "/api/schemas/",
            {"name": "Test", "prefix": "TS", "columns": []},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_create_schema_without_prefix_fails(self):
        """POST without prefix returns 400."""
        response = self.client.post(
            "/api/schemas/",
            {"name": "Test", "schema_type": self.schema_type.id, "columns": []},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_create_schema_duplicate_prefix_fails(self):
        """POST with a prefix already in use returns 400."""
        Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )
        response = self.client.post(
            "/api/schemas/",
            {
                "name": "DNA Copy",
                "prefix": "DNA",
                "schema_type": self.schema_type.id,
                "columns": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("prefix", response.data)

    def test_create_schema_lowercase_prefix_fails(self):
        """POST with lowercase prefix returns 400."""
        response = self.client.post(
            "/api/schemas/",
            {
                "name": "Test",
                "prefix": "dna",
                "schema_type": self.schema_type.id,
                "columns": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class SchemaColumnValidationTests(TestCase):
    """Column validation on the Schema endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="pass")
        make_admin(self.user)
        self.client.force_authenticate(user=self.user)
        self.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims",
            model="mods.lims.models.Entity",
        )

    def test_rejects_invalid_column_type(self):
        response = self.client.post(
            "/api/schemas/",
            {
                "name": "Test",
                "prefix": "TS",
                "schema_type": self.schema_type.id,
                "columns": [{"name": "bad", "type": "Unknown"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("columns", response.data)

    def test_rejects_both_reference_targets(self):
        response = self.client.post(
            "/api/schemas/",
            {
                "name": "Test",
                "prefix": "REFS",
                "schema_type": self.schema_type.id,
                "columns": [{
                    "name": "source",
                    "type": "reference",
                    "referenceSchemaId": 1,
                    "referenceSchemaTypeId": self.schema_type.id,
                }],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_column_named_name(self):
        """User-defined column 'Name' is blocked (case-insensitive)."""
        response = self.client.post(
            "/api/schemas/",
            {
                "name": "Test",
                "prefix": "TS",
                "schema_type": self.schema_type.id,
                "columns": [{"name": "Name", "type": "text"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_column_named_name_whitespace(self):
        """' Name ' is also blocked."""
        response = self.client.post(
            "/api/schemas/",
            {
                "name": "Test",
                "prefix": "TS",
                "schema_type": self.schema_type.id,
                "columns": [{"name": "  Name  ", "type": "text"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class SchemaDefaultDeactivationTests(TestCase):
    """Default schemas cannot be deleted (only deactivated)."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="pass")
        make_admin(self.user)
        self.client.force_authenticate(user=self.user)
        self.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims",
            model="mods.lims.models.Entity",
        )

    def test_can_deactivate_default_schema(self):
        """Default schemas can be deactivated (soft-delete)."""
        s = Schema.objects.create(
            name="Default", prefix="DEF", schema_type=self.schema_type,
            is_default=True,
        )
        response = self.client.delete(f"/api/schemas/{s.id}/")
        self.assertEqual(response.status_code, 204)
        s.refresh_from_db()
        self.assertFalse(s.is_active)

    def test_default_schema_is_visually_distinct(self):
        """The API returns is_default in the list so the frontend can distinguish."""
        Schema.objects.create(
            name="User Schema", prefix="USR", schema_type=self.schema_type,
            is_default=False,
        )
        Schema.objects.create(
            name="Default", prefix="DEF", schema_type=self.schema_type,
            is_default=True,
        )
        response = self.client.get("/api/schemas/")
        self.assertEqual(response.status_code, 200)
        by_name = {s["name"]: s for s in response.data}
        self.assertTrue(by_name["Default"]["is_default"])
        self.assertFalse(by_name["User Schema"]["is_default"])


class SchemaDeleteAllTests(TestCase):
    """Danger zone: delete_all endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="pass")
        make_admin(self.user)
        self.client.force_authenticate(user=self.user)
        self.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims",
            model="mods.lims.models.Entity",
        )

    def test_delete_all_hard_deletes_all_schemas(self):
        Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )
        Schema.objects.create(
            name="Chemical", prefix="CHEM", schema_type=self.schema_type,
        )
        response = self.client.delete("/api/schemas/delete_all/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["deleted"], 2)
        self.assertEqual(Schema.objects.count(), 0)
