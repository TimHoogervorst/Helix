"""
Tests for the LIMS API endpoints.
"""
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from core.tests.base import BaseTestCase
from helix_core.models import SchemaType, Schema
from mods.lims.models import Action as LimsAction, Entity


class LimsApiTests(BaseTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        Schema.objects.create(name="DNA", prefix="DNA", schema_type=self.schema_type)
        Schema.objects.create(name="Chemical", prefix="CHEM", schema_type=self.schema_type)

    def test_list_entities_empty(self):
        """GET returns empty list."""
        response = self.client.get("/api/lims/entities/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_create_entity_succeeds(self):
        """POST creates an entity with auto-generated display_id."""
        self.client.force_authenticate(user=self.user)
        dna_schema = Schema.objects.get(name="DNA")
        response = self.client.post(
            "/api/lims/entities/",
            {"name": "Sample A", "schema": dna_schema.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Sample A")
        self.assertTrue(response.data["display_id"].startswith("DNA"))


# ── Entity API ──

class EntityApiTests(BaseTestCase):
    """Entity listing, detail (by display_id), and batch resolve."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
            columns=[{"name": "concentration", "type": "number"}],
        )
        self.chem_schema = Schema.objects.create(
            name="Chemical", prefix="CHEM", schema_type=self.schema_type,
            columns=[{"name": "purity", "type": "text"}],
        )

    def test_list_entities_with_filters(self):
        """GET /api/lims/entities/ supports ?search= and ?type= filters."""
        e1 = Entity.objects.create(
            name="Sample Alpha", schema=self.dna_schema,
            folder=self.folder, author=self.user,
            properties={"concentration": 42},
        )
        e2 = Entity.objects.create(
            name="Reagent Beta", schema=self.chem_schema,
            folder=self.folder, author=self.user,
            properties={"purity": "High"},
        )

        # Filter by type
        response = self.client.get(f"/api/lims/entities/?type={self.dna_schema.id}")
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
            name="Retrieve Me", schema=self.dna_schema,
            folder=self.folder, author=self.user,
        )
        response = self.client.get(f"/api/lims/entities/{entity.display_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["display_id"], entity.display_id)
        self.assertEqual(response.data["name"], "Retrieve Me")

    def test_retrieve_by_numeric_pk_returns_404(self):
        """GET by numeric pk returns 404 (lookup is by display_id, not pk)."""
        entity = Entity.objects.create(
            name="By PK", schema=self.dna_schema,
            folder=self.folder, author=self.user,
        )
        response = self.client.get(f"/api/lims/entities/{entity.pk}/")
        self.assertEqual(response.status_code, 404)

    def test_batch_resolve_entities(self):
        """POST /api/lims/entities/batch/ resolves display IDs to properties."""
        e1 = Entity.objects.create(
            name="Batch One", schema=self.dna_schema,
            folder=self.folder, author=self.user,
            properties={"concentration": 99},
        )
        e2 = Entity.objects.create(
            name="Batch Two", schema=self.chem_schema,
            folder=self.folder, author=self.user,
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


MIXIN_LOG_ACTION_PATH = "helix_core.actions.mixins.log_action"


def _log_kwargs(mock):
    """Return the keyword-args dict from the *first* call to *mock*."""
    if mock.call_count == 0:
        return {}
    return mock.call_args[1]


# ═══════════════════════════════════════════════════════════════════════
# Action logging tests — Entity CRUD
# ═══════════════════════════════════════════════════════════════════════


class EntityActionLoggingTests(BaseTestCase):
    """Test that Entity CRUD operations log actions via ActionLoggingMixin."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_create_entity_logs_action(self):
        response = self.client.post(
            "/api/lims/entities/",
            {"name": "Sample A", "schema": self.dna_schema.id},
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
            name="Sample A", schema=self.dna_schema,
            folder=self.folder, author=self.user,
        )
        response = self.client.put(
            f"/api/lims/entities/{entity.display_id}/",
            {"name": "Sample A Updated", "schema": self.dna_schema.id},
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
            name="Sample B", schema=self.dna_schema,
            folder=self.folder, author=self.user,
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
            name="Delete Me", schema=self.dna_schema,
            folder=self.folder, author=self.user,
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
            {"name": "Sample C", "schema": self.dna_schema.id},
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
            name="Read Only", schema=self.dna_schema,
            folder=self.folder, author=self.user,
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

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )

    def test_log_exception_does_not_break_entity_create(self):
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.post(
                "/api/lims/entities/",
                {"name": "Survivor", "schema": self.dna_schema.id},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)

    def test_log_exception_does_not_break_entity_delete(self):
        entity = Entity.objects.create(
            name="Delete Me", schema=self.dna_schema,
            folder=self.folder, author=self.user,
        )
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.delete(
                f"/api/lims/entities/{entity.display_id}/"
            )
        self.assertEqual(response.status_code, 204)


# ═══════════════════════════════════════════════════════════════════════
# Regression — existing Entity Actions (user-recorded) untouched
# ═══════════════════════════════════════════════════════════════════════


class ActionViewSetRegressionTests(BaseTestCase):
    """Verify ActionViewSet (user-recorded LIMS actions) still works after
    ActionLoggingMixin is added to the other LIMS viewsets."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )

    def test_list_actions_returns_200(self):
        """GET /api/lims/actions/ still responds correctly."""
        response = self.client.get("/api/lims/actions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_action_model_still_creates_rows(self):
        """LimsAction.objects.create() still works directly."""
        entity = Entity.objects.create(
            name="Test Entity", schema=self.dna_schema,
            folder=self.folder, author=self.user,
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


# ═══════════════════════════════════════════════════════════════════════
# Batch register endpoint — issue #253
# ═══════════════════════════════════════════════════════════════════════

BATCH_REGISTER_URL = "/api/lims/entities/batch-register/"
BATCH_LOG_ACTION_PATH = "mods.lims.views.log_action"


class BatchRegisterCreateTests(BaseTestCase):
    """Test batch-register creates new entities when entity_id is null."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
            columns=[{"name": "concentration", "type": "number"}],
        )

    def test_create_single_entity(self):
        """POST with one row and entity_id: null creates a new entity."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.dna_schema.id,
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
        self.assertEqual(entity.schema, self.dna_schema)
        self.assertEqual(entity.properties, {"concentration": 42})

    def test_create_multiple_entities(self):
        """POST with multiple rows creates multiple entities."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.dna_schema.id,
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

        self.assertEqual(Entity.objects.filter(schema=self.dna_schema).count(), 3)


class BatchRegisterUpdateTests(BaseTestCase):
    """Test batch-register updates existing entities when entity_id is provided."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
            columns=[{"name": "concentration", "type": "number"}],
        )
        self.entity = Entity.objects.create(
            name="Original Name",
            schema=self.dna_schema,
            properties={"concentration": 10},
            author=self.user,
        )

    def test_update_existing_entity(self):
        """POST with an existing entity_id updates the entity."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.dna_schema.id,
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
                "schema_id": self.dna_schema.id,
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

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
            columns=[{"name": "concentration", "type": "number"}],
        )

    def test_missing_name_returns_error(self):
        """A row without a name returns a validation error."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.dna_schema.id,
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
                "schema_id": self.dna_schema.id,
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

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
            columns=[{"name": "concentration", "type": "number"}],
        )

    def test_partial_success_mixed_valid_invalid(self):
        """Valid rows are created even when other rows have errors."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.dna_schema.id,
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
        self.assertEqual(Entity.objects.filter(schema=self.dna_schema).count(), 2)

    def test_partial_success_update_and_create(self):
        """Mix of updates and creates with an error in between."""
        existing = Entity.objects.create(
            name="Existing", schema=self.dna_schema,
            author=self.user,
        )
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.dna_schema.id,
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

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
            columns=[{"name": "concentration", "type": "number"}],
        )

    def test_create_is_idempotent_by_name_and_schema(self):
        """Registering the same (null entity_id, name) twice does not create a duplicate."""
        payload = {
            "schema_id": self.dna_schema.id,
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
            Entity.objects.filter(name="Idempotent Sample", schema=self.dna_schema).count(),
            1,
        )

    def test_update_is_idempotent(self):
        """Updating an entity with the same data twice produces the same result."""
        entity = Entity.objects.create(
            name="Update Me", schema=self.dna_schema,
            properties={"concentration": 10}, author=self.user,
        )
        payload = {
            "schema_id": self.dna_schema.id,
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
        self.assertEqual(Entity.objects.filter(schema=self.dna_schema).count(), 1)


class BatchRegisterActionLoggingTests(BaseTestCase):
    """Test that batch-register logs an action with correct metadata."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
            columns=[{"name": "concentration", "type": "number"}],
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
                "schema_id": self.dna_schema.id,
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
        self.assertEqual(kwargs["target_id"], self.dna_schema.id)
        self.assertEqual(kwargs["user"], self.user)

        metadata = kwargs["metadata"]
        self.assertEqual(metadata["schema_id"], self.dna_schema.id)
        self.assertEqual(metadata["count"], 2)
        self.assertEqual(len(metadata["entity_ids"]), 2)

    def test_logs_action_with_request_id(self):
        """Batch register action log includes request_id."""
        self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.dna_schema.id,
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
                "schema_id": self.dna_schema.id,
                "rows": [{"entity_id": None, "name": "Sample A", "values": {}}],
            },
            format="json",
        )
        kwargs = self.mock_log.call_args[1]
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")


class BatchRegisterSchemaNotFoundTests(BaseTestCase):
    """Test behaviour when schema_id does not exist."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_nonexistent_schema_returns_404(self):
        """POST with a non-existent schema_id returns 404."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": 99999,
                "rows": [{"entity_id": None, "name": "Sample A", "values": {}}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 404)


class BatchRegisterSerializerValidationTests(TestCase):
    """Test top-level serializer validation for batch-register."""

    def setUp(self):
        self.client = APIClient()

    def test_missing_schema_id_returns_400(self):
        """POST without schema_id returns 400."""
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
            {"schema_id": 1},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_empty_rows_returns_400(self):
        """POST with empty rows array returns 400."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": 1, "rows": []},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


# ═══════════════════════════════════════════════════════════════════════
# Default schema fallback — issue #302
# ═══════════════════════════════════════════════════════════════════════


class EntityDefaultSchemaTests(BaseTestCase):
    """When no schema is provided, the default Schema for the LIMS
    SchemaType is assigned automatically."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.default_schema = Schema.objects.create(
            name="Default", prefix="E", schema_type=self.schema_type, is_default=True,
        )
        Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type, is_default=False,
        )

    def test_create_entity_without_schema_uses_default(self):
        """POST without 'schema' assigns the is_default Schema."""
        response = self.client.post(
            "/api/lims/entities/",
            {"name": "No Schema Provided"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["schema"], self.default_schema.id)
        self.assertEqual(response.data["schema_name"], "Default")
        self.assertEqual(response.data["schema_prefix"], "E")
        self.assertTrue(response.data["display_id"].startswith("E"))

    def test_create_entity_with_explicit_schema_overrides_default(self):
        """POST with explicit 'schema' uses the provided schema, not the default."""
        dna_schema = Schema.objects.get(name="DNA")
        response = self.client.post(
            "/api/lims/entities/",
            {"name": "Explicit Schema", "schema": dna_schema.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["schema"], dna_schema.id)
        self.assertTrue(response.data["display_id"].startswith("DNA"))

    def test_create_entity_without_schema_when_no_default_schema(self):
        """POST without 'schema' when no default Schema exists raises an error."""
        # Delete the default schema so there's no fallback
        self.default_schema.delete()
        response = self.client.post(
            "/api/lims/entities/",
            {"name": "No Default Available"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("schema", response.data)


# ═══════════════════════════════════════════════════════════════════════
# Authentication required for mutations — issue #302
# ═══════════════════════════════════════════════════════════════════════


class EntityAuthRequiredTests(BaseTestCase):
    """Entity create/update/delete requires authentication because
    ``author`` is non-nullable on AbstractEntity."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )

    def test_create_entity_unauthenticated_returns_403(self):
        """POST without auth returns 403 — author is required and non-nullable."""
        response = self.client.post(
            "/api/lims/entities/",
            {"name": "No Auth", "schema": self.schema.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_batch_register_unauthenticated_returns_403(self):
        """POST batch-register without auth returns 403 — author is required."""
        response = self.client.post(
            "/api/lims/entities/batch-register/",
            {"schema_id": self.schema.id, "rows": [{"entity_id": None, "name": "X", "values": {}}]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)


# ═══════════════════════════════════════════════════════════════════════
# Batch register — column type validation (issue #333)
# ═══════════════════════════════════════════════════════════════════════


class BatchRegisterNumberValidationTests(BaseTestCase):
    """Number columns are validated during batch register."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.schema = Schema.objects.create(
            name="Test", prefix="TST", schema_type=self.schema_type,
            columns=[{"name": "concentration", "type": "number"}],
        )

    def test_valid_number_accepted(self):
        """Integer and float values pass number validation."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"concentration": 42}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_numeric_string_accepted(self):
        """Numeric strings like '42' pass number validation."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"concentration": "3.14"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_non_numeric_string_rejected(self):
        """Non-numeric strings produce a row-level error."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"concentration": "abc"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 0)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["row_index"], 0)
        self.assertEqual(response.data["errors"][0]["field"], "concentration")
        self.assertIn("not a valid number", response.data["errors"][0]["message"])

    def test_empty_value_accepted(self):
        """Empty string is acceptable (field not required)."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"concentration": ""}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_null_value_accepted(self):
        """None/null value is acceptable."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"concentration": None}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)


class BatchRegisterDateValidationTests(BaseTestCase):
    """Date columns are validated during batch register."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.schema = Schema.objects.create(
            name="Test", prefix="TST", schema_type=self.schema_type,
            columns=[{"name": "sample_date", "type": "date"}],
        )

    def test_valid_iso_date_accepted(self):
        """ISO 8601 date strings pass date validation."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"sample_date": "2025-01-15"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_invalid_date_string_rejected(self):
        """Invalid date strings produce a row-level error."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"sample_date": "not-a-date"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["field"], "sample_date")
        self.assertIn("not a valid ISO 8601 date", response.data["errors"][0]["message"])


class BatchRegisterDatetimeValidationTests(BaseTestCase):
    """Datetime columns are validated during batch register."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.schema = Schema.objects.create(
            name="Test", prefix="TST", schema_type=self.schema_type,
            columns=[{"name": "recorded_at", "type": "Datetime"}],
        )

    def test_valid_iso_datetime_accepted(self):
        """ISO 8601 datetime strings pass validation."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A",
                 "values": {"recorded_at": "2025-01-15T14:30:00"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_invalid_datetime_string_rejected(self):
        """Invalid datetime strings produce a row-level error."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A",
                 "values": {"recorded_at": "not-a-datetime"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["field"], "recorded_at")
        self.assertIn("not a valid ISO 8601 datetime", response.data["errors"][0]["message"])


class BatchRegisterBooleanValidationTests(BaseTestCase):
    """Boolean columns accept true/false in multiple forms."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.schema = Schema.objects.create(
            name="Test", prefix="TST", schema_type=self.schema_type,
            columns=[{"name": "is_active", "type": "boolean"}],
        )

    def test_json_boolean_accepted(self):
        """JSON true/false values pass boolean validation."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"is_active": True}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_string_true_accepted(self):
        """String 'true' (case-insensitive) passes boolean validation."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"is_active": "True"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_string_false_accepted(self):
        """String 'false' (case-insensitive) passes boolean validation."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"is_active": "FALSE"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_invalid_boolean_string_rejected(self):
        """Invalid boolean strings produce a row-level error."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"is_active": "yes"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["field"], "is_active")
        self.assertIn("not a valid boolean", response.data["errors"][0]["message"])


class BatchRegisterSelectValidationTests(BaseTestCase):
    """Select columns are validated during batch register."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.schema = Schema.objects.create(
            name="Test", prefix="TST", schema_type=self.schema_type,
            columns=[{"name": "status", "type": "Select"}],
        )

    def test_string_accepted_without_dropdown_options(self):
        """Without dropdown options, any string is acceptable."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"status": "In Progress"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_non_string_rejected(self):
        """Non-string values for dropdown columns are rejected."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"status": 42}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["field"], "status")


class BatchRegisterReferenceValidationTests(BaseTestCase):
    """Reference columns validate prefix+DIGITS format."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.schema = Schema.objects.create(
            name="Test", prefix="TST", schema_type=self.schema_type,
            columns=[{"name": "source", "type": "reference"}],
        )

    def test_valid_reference_accepted(self):
        """Valid prefix+DIGITS format passes reference validation."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"source": "DNA42"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_invalid_reference_format_rejected(self):
        """Values without prefix+DIGITS format produce a row-level error."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"source": "ref-123"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["field"], "source")
        self.assertIn("not a valid reference", response.data["errors"][0]["message"])

    def test_int_reference_accepted(self):
        """Integer values are accepted as references (e.g. user IDs)."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"source": 42}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)


class BatchRegisterTextValidationTests(BaseTestCase):
    """Text columns accept any value (base validate returns True)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.schema = Schema.objects.create(
            name="Test", prefix="TST", schema_type=self.schema_type,
            columns=[{"name": "notes", "type": "text"}],
        )

    def test_any_string_accepted(self):
        """Any string value is accepted for text columns."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"notes": "anything goes"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_non_string_rejected(self):
        """Non-string values for text columns are rejected."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"notes": 123}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["field"], "notes")


class BatchRegisterColumnTypePartialSuccessTests(BaseTestCase):
    """Column-type validation errors preserve partial success."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.schema = Schema.objects.create(
            name="Test", prefix="TST", schema_type=self.schema_type,
            columns=[
                {"name": "concentration", "type": "number"},
                {"name": "sample_date", "type": "date"},
            ],
        )

    def test_valid_rows_succeed_alongside_validation_errors(self):
        """Rows with valid values still succeed when other rows fail type validation."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.schema.id,
                "rows": [
                    {"entity_id": None, "name": "Valid", "values": {"concentration": 42}},
                    {"entity_id": None, "name": "BadNumber", "values": {"concentration": "abc"}},
                    {"entity_id": None, "name": "AlsoValid", "values": {"sample_date": "2025-01-15"}},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["results"][0]["row_index"], 0)
        self.assertEqual(response.data["results"][1]["row_index"], 2)
        self.assertEqual(response.data["errors"][0]["row_index"], 1)
        self.assertEqual(response.data["errors"][0]["field"], "concentration")

        # Verify only 2 entities created
        self.assertEqual(Entity.objects.filter(schema=self.schema).count(), 2)

    def test_multiple_validation_errors_in_same_row(self):
        """Multiple invalid values in the same row are reported (first error only)."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.schema.id,
                "rows": [
                    {"entity_id": None, "name": "Bad",
                     "values": {"concentration": "abc", "sample_date": "not-a-date"}},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 0)
        # First failing field triggers the error; the row is skipped.
        self.assertGreaterEqual(len(response.data["errors"]), 1)

    def test_unknown_columns_skipped(self):
        """Properties without a matching column definition are skipped, not errored."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"unknown_prop": "whatever"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_mixed_name_error_and_type_validation_error(self):
        """Both name errors and type validation errors appear in the same response."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.schema.id,
                "rows": [
                    {"entity_id": None, "name": "", "values": {}},               # name error
                    {"entity_id": None, "name": "Bad", "values": {"concentration": "xyz"}},  # type error
                    {"entity_id": None, "name": "Good", "values": {"concentration": 10}},    # ok
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 2)
        self.assertEqual(response.data["errors"][0]["field"], "name")
        self.assertEqual(response.data["errors"][1]["field"], "concentration")
        self.assertEqual(Entity.objects.filter(schema=self.schema).count(), 1)

    def test_existing_tests_still_pass_number_column(self):
        """Regression test: existing batch register behavior works with validation."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {
                "schema_id": self.schema.id,
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
        self.assertEqual(result["status"], "created")
        self.assertTrue(result["display_id"].startswith("TST"))


class BatchRegisterCaseInsensitiveTypeIdTests(BaseTestCase):
    """Column type IDs are accepted in lowercase for column type registry lookup."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        # Lowercase type IDs match the column type registry convention.
        self.schema = Schema.objects.create(
            name="Test", prefix="TST", schema_type=self.schema_type,
            columns=[{"name": "count", "type": "number"}],
        )

    def test_lowercase_type_id_is_validated(self):
        """Lowercase type IDs like 'number' are validated via the registry."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"count": 42}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(len(response.data["errors"]), 0)

    def test_lowercase_type_id_rejects_invalid_value(self):
        """Validation works with lowercase type IDs."""
        response = self.client.post(
            BATCH_REGISTER_URL,
            {"schema_id": self.schema.id, "rows": [
                {"entity_id": None, "name": "A", "values": {"count": "abc"}},
            ]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["errors"]), 1)
        self.assertEqual(response.data["errors"][0]["field"], "count")
