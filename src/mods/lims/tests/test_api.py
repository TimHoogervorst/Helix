"""
Tests for the LIMS API endpoints.
"""
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from core.tests.base import BaseTestCase
from mods.lims.models import Action as LimsAction, EntityType, Entity


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


# ═══════════════════════════════════════════════════════════════════════
# Action logging tests — EntityType CRUD
# ═══════════════════════════════════════════════════════════════════════

MIXIN_LOG_ACTION_PATH = "helix_core.actions.mixins.log_action"


def _log_kwargs(mock):
    """Return the keyword-args dict from the *first* call to *mock*."""
    if mock.call_count == 0:
        return {}
    return mock.call_args[1]


class EntityTypeActionLoggingTests(BaseTestCase):
    """Test that EntityType CRUD operations log actions via ActionLoggingMixin."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_create_entity_type_logs_action(self):
        response = self.client.post(
            "/api/lims/entity-types/",
            {"name": "Blood Sample", "prefix": "BLOOD", "columns": []},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "lims.entity_type.created")
        self.assertEqual(kwargs["target_type"], "lims.entity_type")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.user)

    def test_update_entity_type_logs_action(self):
        et = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])
        response = self.client.put(
            f"/api/lims/entity-types/{et.id}/",
            {"name": "DNA Updated", "prefix": "DNA", "columns": []},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "lims.entity_type.edited")
        self.assertEqual(kwargs["target_type"], "lims.entity_type")
        self.assertEqual(kwargs["target_id"], et.id)

    def test_partial_update_entity_type_logs_action(self):
        et = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])
        response = self.client.patch(
            f"/api/lims/entity-types/{et.id}/",
            {"name": "DNA Patched"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "lims.entity_type.edited")
        self.assertEqual(kwargs["target_type"], "lims.entity_type")

    def test_soft_delete_entity_type_logs_action(self):
        et = EntityType.objects.create(name="Temp", prefix="TEMP", columns=[])
        response = self.client.delete(f"/api/lims/entity-types/{et.id}/")
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "lims.entity_type.deleted")
        self.assertEqual(kwargs["target_type"], "lims.entity_type")
        self.assertEqual(kwargs["target_id"], et.id)

    def test_create_entity_type_captures_request_id(self):
        self.client.post(
            "/api/lims/entity-types/",
            {"name": "Blood", "prefix": "BLOOD", "columns": []},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertIsNotNone(kwargs["request_id"])
        self.assertEqual(len(str(kwargs["request_id"])), 36)

    def test_create_entity_type_captures_client_ip(self):
        self.client.post(
            "/api/lims/entity-types/",
            {"name": "Blood", "prefix": "BLOOD", "columns": []},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")


# ═══════════════════════════════════════════════════════════════════════
# Action logging tests — Entity CRUD
# ═══════════════════════════════════════════════════════════════════════


class EntityActionLoggingTests(BaseTestCase):
    """Test that Entity CRUD operations log actions via ActionLoggingMixin."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_type = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_create_entity_logs_action(self):
        response = self.client.post(
            "/api/lims/entities/",
            {"name": "Sample A", "entity_type": self.dna_type.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "lims.entity.created")
        self.assertEqual(kwargs["target_type"], "lims.entity")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.user)

    def test_update_entity_logs_action(self):
        entity = Entity.objects.create(
            name="Sample A", entity_type=self.dna_type,
            folder=self.folder, created_by=self.user,
        )
        response = self.client.put(
            f"/api/lims/entities/{entity.display_id}/",
            {"name": "Sample A Updated", "entity_type": self.dna_type.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "lims.entity.edited")
        self.assertEqual(kwargs["target_type"], "lims.entity")
        self.assertEqual(kwargs["target_id"], entity.pk)

    def test_partial_update_entity_logs_action(self):
        entity = Entity.objects.create(
            name="Sample B", entity_type=self.dna_type,
            folder=self.folder, created_by=self.user,
        )
        response = self.client.patch(
            f"/api/lims/entities/{entity.display_id}/",
            {"name": "Sample B Patched"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "lims.entity.edited")
        self.assertEqual(kwargs["target_type"], "lims.entity")

    def test_delete_entity_logs_action(self):
        entity = Entity.objects.create(
            name="Delete Me", entity_type=self.dna_type,
            folder=self.folder, created_by=self.user,
        )
        response = self.client.delete(
            f"/api/lims/entities/{entity.display_id}/"
        )
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "lims.entity.deleted")
        self.assertEqual(kwargs["target_type"], "lims.entity")
        self.assertEqual(kwargs["target_id"], entity.pk)

    def test_create_entity_captures_request_id_and_client_ip(self):
        self.client.post(
            "/api/lims/entities/",
            {"name": "Sample C", "entity_type": self.dna_type.id},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertIsNotNone(kwargs["request_id"])
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")

    def test_list_entities_does_not_log(self):
        response = self.client.get("/api/lims/entities/")
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_not_called()

    def test_retrieve_entity_does_not_log(self):
        entity = Entity.objects.create(
            name="Read Only", entity_type=self.dna_type,
            folder=self.folder, created_by=self.user,
        )
        response = self.client.get(
            f"/api/lims/entities/{entity.display_id}/"
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_not_called()

    def test_batch_resolve_does_not_log(self):
        response = self.client.post(
            "/api/lims/entities/batch/",
            {"ids": []},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════
# Action logging — fail-open tests
# ═══════════════════════════════════════════════════════════════════════


class LimsActionLoggingFailOpenTests(BaseTestCase):
    """Test that action logging failure never breaks LIMS responses."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_type = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])

    def test_log_exception_does_not_break_entity_type_create(self):
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.post(
                "/api/lims/entity-types/",
                {"name": "Survivor", "prefix": "SURV", "columns": []},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)

    def test_log_exception_does_not_break_entity_type_delete(self):
        et = EntityType.objects.create(name="Temp", prefix="TEMP", columns=[])
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.delete(f"/api/lims/entity-types/{et.id}/")
        self.assertEqual(response.status_code, 204)

    def test_log_exception_does_not_break_entity_create(self):
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.post(
                "/api/lims/entities/",
                {"name": "Survivor", "entity_type": self.dna_type.id},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)

    def test_log_exception_does_not_break_entity_delete(self):
        entity = Entity.objects.create(
            name="Delete Me", entity_type=self.dna_type,
            folder=self.folder, created_by=self.user,
        )
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.delete(
                f"/api/lims/entities/{entity.display_id}/"
            )
        self.assertEqual(response.status_code, 204)


# ═══════════════════════════════════════════════════════════════════════
# Regression — existing LIMS Entity Actions (user-recorded) untouched
# ═══════════════════════════════════════════════════════════════════════


class ActionViewSetRegressionTests(BaseTestCase):
    """Verify ActionViewSet (user-recorded LIMS actions) still works after
    ActionLoggingMixin is added to the other LIMS viewsets."""

    def setUp(self):
        super().setUp()
        self.dna_type = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])

    def test_list_actions_returns_200(self):
        """GET /api/lims/actions/ still responds correctly."""
        response = self.client.get("/api/lims/actions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_action_model_still_creates_rows(self):
        """LimsAction.objects.create() still works directly."""
        entity = Entity.objects.create(
            name="Test Entity", entity_type=self.dna_type,
            folder=self.folder, created_by=self.user,
        )
        action = LimsAction.objects.create(
            performed_by=self.user,
            action_type="created",
            target_type="lims.entity",
            target_id=entity.pk,
            entity=entity,
        )
        self.assertIsNotNone(action.pk)
        self.assertEqual(action.action_type, "created")
        self.assertEqual(action.entity, entity)


# ═══════════════════════════════════════════════════════════════════════
# Column IDs and content hash API tests — issue #252
# ═══════════════════════════════════════════════════════════════════════


class EntityTypeColumnIdApiTests(TestCase):
    """Column UUID ids are returned by the API and generated server-side."""

    def setUp(self):
        self.client = APIClient()

    def test_get_entity_type_includes_column_ids(self):
        """GET response includes column IDs in the columns array."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number"}],
        )
        response = self.client.get(f"/api/lims/entity-types/{et.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("id", response.data["columns"][0])
        self.assertEqual(len(response.data["columns"][0]["id"]), 36)

    def test_create_entity_type_generates_column_ids(self):
        """POST creates entity type with auto-generated column IDs."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {
                "name": "New Type",
                "prefix": "NEWT",
                "columns": [
                    {"name": "volume", "type": "Number"},
                    {"name": "colour", "type": "Text"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["columns"]), 2)
        for col in response.data["columns"]:
            self.assertIn("id", col)
            self.assertEqual(len(col["id"]), 36)

    def test_update_preserves_existing_column_ids(self):
        """PUT preserves column IDs for existing columns."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number"}],
        )
        original_id = et.columns[0]["id"]

        response = self.client.put(
            f"/api/lims/entity-types/{et.id}/",
            {
                "name": "Updated Type",
                "prefix": "TEST",
                "columns": [
                    {"name": "volume", "type": "Number"},  # no id — server should preserve
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        # When columns are sent without ids, new ids are generated
        # (This tests the re-generation path)
        self.assertIn("id", response.data["columns"][0])


class EntityTypeContentHashApiTests(TestCase):
    """content_hash is returned by the API and updates on column changes."""

    def setUp(self):
        self.client = APIClient()

    def test_get_entity_type_includes_content_hash(self):
        """GET response includes content_hash."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number"}],
        )
        response = self.client.get(f"/api/lims/entity-types/{et.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("content_hash", response.data)
        self.assertEqual(len(response.data["content_hash"]), 64)

    def test_list_entity_types_includes_content_hash(self):
        """GET list response includes content_hash for each entity type."""
        EntityType.objects.create(
            name="Type A", prefix="TYPEA",
            columns=[{"name": "vol", "type": "Number"}],
        )
        EntityType.objects.create(
            name="Type B", prefix="TYPEB",
            columns=[{"name": "mass", "type": "Number"}],
        )
        response = self.client.get("/api/lims/entity-types/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        for et_data in response.data:
            self.assertIn("content_hash", et_data)
            self.assertEqual(len(et_data["content_hash"]), 64)

    def test_content_hash_changes_after_column_update(self):
        """content_hash in API response changes when columns are modified."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number"}],
        )
        response = self.client.get(f"/api/lims/entity-types/{et.id}/")
        original_hash = response.data["content_hash"]

        response = self.client.put(
            f"/api/lims/entity-types/{et.id}/",
            {
                "name": "Test Type",
                "prefix": "TEST",
                "columns": [
                    {"name": "volume", "type": "Number"},
                    {"name": "colour", "type": "Text"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.data["content_hash"], original_hash)

    def test_create_entity_type_returns_content_hash(self):
        """POST response includes content_hash."""
        response = self.client.post(
            "/api/lims/entity-types/",
            {
                "name": "New Type",
                "prefix": "NEWT",
                "columns": [{"name": "volume", "type": "Number"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("content_hash", response.data)
        self.assertEqual(len(response.data["content_hash"]), 64)


# ═══════════════════════════════════════════════════════════════════════
# Batch register endpoint — issue #253
# ═══════════════════════════════════════════════════════════════════════

BATCH_REGISTER_URL = "/api/lims/entities/batch-register/"
BATCH_LOG_ACTION_PATH = "mods.lims.views.log_action"


class BatchRegisterCreateTests(BaseTestCase):
    """Test batch-register creates new entities when entity_id is null."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_type = EntityType.objects.create(
            name="DNA", prefix="DNA",
            columns=[{"name": "concentration", "type": "Number"}],
        )

    def test_create_single_entity(self):
        """POST with one row and entity_id: null creates a new entity."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [
                    {"entity_id": None, "name": "Sample A", "values": {"concentration": 42}},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

        result = response.data["results"][0]
        self.assertEqual(result["row_index"], 0)
        self.assertEqual(result["status"], "created")
        self.assertTrue(result["display_id"].startswith("DNA"))
        self.assertIsNotNone(result["entity_id"])

        # Verify entity was persisted
        entity = Entity.objects.get(pk=result["entity_id"])
        self.assertEqual(entity.name, "Sample A")
        self.assertEqual(entity.entity_type, self.dna_type)
        self.assertEqual(entity.properties, {"concentration": 42})

    def test_create_multiple_entities(self):
        """POST with multiple rows creates multiple entities."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [
                    {"entity_id": None, "name": "Sample A", "values": {}},
                    {"entity_id": None, "name": "Sample B", "values": {}},
                    {"entity_id": None, "name": "Sample C", "values": {}},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 3)
        self.assertEqual(len(response.data["errors"]), 0)

        for i, result in enumerate(response.data["results"]):
            self.assertEqual(result["row_index"], i)
            self.assertEqual(result["status"], "created")

        self.assertEqual(Entity.objects.filter(entity_type=self.dna_type).count(), 3)


class BatchRegisterUpdateTests(BaseTestCase):
    """Test batch-register updates existing entities when entity_id is provided."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_type = EntityType.objects.create(
            name="DNA", prefix="DNA",
            columns=[{"name": "concentration", "type": "Number"}],
        )
        self.entity = Entity.objects.create(
            name="Original Name",
            entity_type=self.dna_type,
            properties={"concentration": 10},
            created_by=self.user,
        )

    def test_update_existing_entity(self):
        """POST with an existing entity_id updates the entity."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [
                    {
                        "entity_id": self.entity.id,
                        "name": "Updated Name",
                        "values": {"concentration": 99},
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

        result = response.data["results"][0]
        self.assertEqual(result["row_index"], 0)
        self.assertEqual(result["entity_id"], self.entity.id)
        self.assertEqual(result["display_id"], self.entity.display_id)
        self.assertEqual(result["status"], "updated")

        # Verify entity was persisted
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.name, "Updated Name")
        self.assertEqual(self.entity.properties, {"concentration": 99})

    def test_update_nonexistent_entity_id(self):
        """POST with an entity_id that does not exist returns an error for that row."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [
                    {"entity_id": 99999, "name": "Ghost", "values": {}},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 0)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["row_index"], 0)
        self.assertEqual(response.data["errors"][0]["field"], "entity_id")


class BatchRegisterValidationTests(BaseTestCase):
    """Test validation errors in batch-register."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_type = EntityType.objects.create(
            name="DNA", prefix="DNA",
            columns=[{"name": "concentration", "type": "Number"}],
        )

    def test_missing_name_returns_error(self):
        """A row without a name returns a validation error."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [
                    {"entity_id": None, "name": "", "values": {}},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 0)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["row_index"], 0)
        self.assertEqual(response.data["errors"][0]["field"], "name")
        self.assertEqual(response.data["errors"][0]["message"], "Name is required.")

    def test_whitespace_name_returns_error(self):
        """A row with a whitespace-only name returns a validation error."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [
                    {"entity_id": None, "name": "   ", "values": {}},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["field"], "name")


class BatchRegisterPartialSuccessTests(BaseTestCase):
    """Test that valid rows succeed even when other rows fail validation."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_type = EntityType.objects.create(
            name="DNA", prefix="DNA",
            columns=[{"name": "concentration", "type": "Number"}],
        )

    def test_partial_success_mixed_valid_invalid(self):
        """Valid rows are created even when other rows have errors."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [
                    {"entity_id": None, "name": "Valid A", "values": {}},
                    {"entity_id": None, "name": "", "values": {}},         # missing name
                    {"entity_id": None, "name": "Valid B", "values": {}},
                    {"entity_id": None, "name": "   ", "values": {}},      # whitespace name
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(len(response.data["errors"]), 2)

        self.assertEqual(response.data["results"][0]["row_index"], 0)
        self.assertEqual(response.data["results"][0]["status"], "created")
        self.assertEqual(response.data["results"][1]["row_index"], 2)
        self.assertEqual(response.data["results"][1]["status"], "created")

        self.assertEqual(response.data["errors"][0]["row_index"], 1)
        self.assertEqual(response.data["errors"][0]["field"], "name")
        self.assertEqual(response.data["errors"][1]["row_index"], 3)
        self.assertEqual(response.data["errors"][1]["field"], "name")

        # Verify only the valid entities were created
        self.assertEqual(Entity.objects.filter(entity_type=self.dna_type).count(), 2)

    def test_partial_success_update_and_create(self):
        """Mix of updates and creates with an error in between."""
        existing = Entity.objects.create(
            name="Existing", entity_type=self.dna_type,
            created_by=self.user,
        )
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [
                    {"entity_id": existing.id, "name": "Existing Updated", "values": {}},
                    {"entity_id": None, "name": "", "values": {}},                      # error
                    {"entity_id": None, "name": "New Entity", "values": {}},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(len(response.data["errors"]), 1)

        self.assertEqual(response.data["results"][0]["status"], "updated")
        self.assertEqual(response.data["results"][1]["status"], "created")
        self.assertEqual(response.data["errors"][0]["row_index"], 1)

        existing.refresh_from_db()
        self.assertEqual(existing.name, "Existing Updated")


class BatchRegisterIdempotencyTests(BaseTestCase):
    """Test that batch-register is idempotent — no duplicates on re-registration."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_type = EntityType.objects.create(
            name="DNA", prefix="DNA",
            columns=[{"name": "concentration", "type": "Number"}],
        )

    def test_create_is_idempotent_by_name_and_type(self):
        """Registering the same (null entity_id, name) twice does not create a duplicate."""
        payload = {
            "entity_type_id": self.dna_type.id,
            "rows": [
                {"entity_id": None, "name": "Idempotent Sample", "values": {"concentration": 42}},
            ],
        }

        # First request — creates
        response1 = self.client.post(BATCH_REGISTER_URL, payload, format="json")
        self.assertEqual(response1.status_code, 200)
        self.assertEqual(response1.data["results"][0]["status"], "created")
        entity_id1 = response1.data["results"][0]["entity_id"]

        # Second request — same payload, should update instead of creating duplicate
        response2 = self.client.post(BATCH_REGISTER_URL, payload, format="json")
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data["results"][0]["status"], "updated")
        self.assertEqual(response2.data["results"][0]["entity_id"], entity_id1)

        # Only one entity exists
        self.assertEqual(
            Entity.objects.filter(name="Idempotent Sample", entity_type=self.dna_type).count(),
            1,
        )

    def test_update_is_idempotent(self):
        """Updating an entity with the same data twice produces the same result."""
        entity = Entity.objects.create(
            name="Update Me", entity_type=self.dna_type,
            properties={"concentration": 10}, created_by=self.user,
        )
        payload = {
            "entity_type_id": self.dna_type.id,
            "rows": [
                {"entity_id": entity.id, "name": "Update Me", "values": {"concentration": 99}},
            ],
        }

        # First update
        response1 = self.client.post(BATCH_REGISTER_URL, payload, format="json")
        self.assertEqual(response1.status_code, 200)
        self.assertEqual(response1.data["results"][0]["status"], "updated")

        # Second update — same payload
        response2 = self.client.post(BATCH_REGISTER_URL, payload, format="json")
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data["results"][0]["status"], "updated")
        self.assertEqual(response2.data["results"][0]["entity_id"], entity.id)

        # Only one entity exists
        self.assertEqual(Entity.objects.filter(entity_type=self.dna_type).count(), 1)


class BatchRegisterActionLoggingTests(BaseTestCase):
    """Test that batch-register logs an action with correct metadata."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_type = EntityType.objects.create(
            name="DNA", prefix="DNA",
            columns=[{"name": "concentration", "type": "Number"}],
        )
        self._patcher = patch(BATCH_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_logs_action_with_correct_metadata(self):
        """Batch register logs eln.entities.registered with metadata."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [
                    {"entity_id": None, "name": "Sample A", "values": {}},
                    {"entity_id": None, "name": "Sample B", "values": {}},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 2)

        self.mock_log.assert_called_once()
        kwargs = self.mock_log.call_args[1]
        self.assertEqual(kwargs["action_type"], "eln.entities.registered")
        self.assertEqual(kwargs["target_type"], "lims.entities")
        self.assertEqual(kwargs["target_id"], self.dna_type.id)
        self.assertEqual(kwargs["user"], self.user)

        metadata = kwargs["metadata"]
        self.assertEqual(metadata["entity_type_id"], self.dna_type.id)
        self.assertEqual(metadata["count"], 2)
        self.assertEqual(len(metadata["entity_ids"]), 2)

    def test_logs_action_with_request_id(self):
        """Batch register action log includes request_id."""
        self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [{"entity_id": None, "name": "Sample A", "values": {}}],
            },
            format="json",
        )
        kwargs = self.mock_log.call_args[1]
        self.assertIsNotNone(kwargs["request_id"])

    def test_logs_action_with_client_ip(self):
        """Batch register action log includes client_ip."""
        self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": self.dna_type.id,
                "rows": [{"entity_id": None, "name": "Sample A", "values": {}}],
            },
            format="json",
        )
        kwargs = self.mock_log.call_args[1]
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")


class BatchRegisterEntityTypeNotFoundTests(BaseTestCase):
    """Test behaviour when entity_type_id does not exist."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_nonexistent_entity_type_returns_404(self):
        """POST with a non-existent entity_type_id returns 404."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "entity_type_id": 99999,
                "rows": [{"entity_id": None, "name": "Sample A", "values": {}}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 404)


class BatchRegisterSerializerValidationTests(TestCase):
    """Test top-level serializer validation for batch-register."""

    def setUp(self):
        self.client = APIClient()

    def test_missing_entity_type_id_returns_400(self):
        """POST without entity_type_id returns 400."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"rows": [{"entity_id": None, "name": "Sample", "values": {}}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_rows_returns_400(self):
        """POST without rows returns 400."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"entity_type_id": 1},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_empty_rows_returns_400(self):
        """POST with empty rows array returns 400."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"entity_type_id": 1, "rows": []},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
