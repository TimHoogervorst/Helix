"""Generic action endpoint contracts using the Platform-owned Mod fixture."""

import importlib
from uuid import UUID
from unittest.mock import patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from bundled.access.access.models import Grant, ProjectRole
from helix_core.core.models import Folder, Project, User
from helix_core.models import ActionLogEntry, Schema, SchemaType
from helix_core.mod_system.registry import BackendModRegistry
from helix_core.public import ModRegistrar, load_entry_point_manifest
from helix_core.tests.fixtures.external_mod.models import ConcreteTestEntity


class UnifiedActionEndpointTests(TestCase):
    """Exercise real fixture registration, authorization, dispatch, and persistence."""

    def setUp(self):
        self.backend_registry = BackendModRegistry()
        self.registry_patch = patch(
            "helix_core.mod_system.registry.registry", self.backend_registry
        )
        self.registry_patch.start()

        package = "helix_core.tests.fixtures.external_mod"
        manifest = load_entry_point_manifest("test.external", package)
        registrar = ModRegistrar(manifest, self.backend_registry)
        importlib.import_module(f"{package}.mod").register(registrar)

        self.user = User.objects.create_user(username="action_editor", password="pass")
        self.project = Project.objects.create(name="Action Project")
        self.folder = Folder.objects.create(
            name="Target", parent=None, project=self.project
        )
        Grant.objects.create(
            project=self.project, user=self.user, role=ProjectRole.EDIT
        )
        schema_type = SchemaType.objects.create(
            display_name="Fixture Entity",
            workspace_id="test.external",
            model="helix_core.tests.fixtures.external_mod.models.ConcreteTestEntity",
        )
        schema = Schema.objects.create(
            name="Fixture", prefix="FX", schema_type=schema_type
        )
        self.target = ConcreteTestEntity.objects.create(
            name="Action target",
            author=self.user,
            schema=schema,
            source=self.folder,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        self.registry_patch.stop()
        super().tearDown()

    def payload(self, **overrides):
        values = {
            "action": "created",
            "action_type": "created",
            "target_type": "test.external.entry",
            "target_id": self.target.pk,
            "workspace_id": "external",
        }
        values.update(overrides)
        return values

    def test_core_action_dispatches_and_persists_each_mutation_verb(self):
        for verb in ("created", "edited", "deleted"):
            with self.subTest(verb=verb):
                response = self.client.post(
                    "/api/actions/",
                    self.payload(action=verb, action_type=verb, metadata={"verb": verb}),
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                self.assertEqual(len(response.data), 1)
                self.assertEqual(
                    set(response.data[0]),
                    {
                        "id",
                        "action",
                        "action_type",
                        "target_type",
                        "target_id",
                        "metadata",
                        "created_at",
                        "performed_by",
                    },
                )
                self.assertEqual(
                    set(response.data[0]["performed_by"]), {"id", "username", "displayName"}
                )
                self.assertEqual(response.data[0]["performed_by"]["displayName"], self.user.username)
                row = ActionLogEntry.objects.get(action=verb)
                self.assertEqual(row.performed_by, self.user)
                self.assertEqual(row.initiating_mod_id, "external")
                self.assertEqual(row.action_type, verb)
                self.assertEqual(row.target_type, "test.external.entry")
                self.assertEqual(row.target_id, self.target.pk)
                self.assertEqual(row.metadata, {"verb": verb})
                self.assertEqual(response.data[0]["id"], row.pk)

        self.assertEqual(ActionLogEntry.objects.count(), 3)

    def test_fixture_catalog_exposes_core_verbs_including_read(self):
        catalog = self.backend_registry.get_action_catalog("external")

        self.assertEqual(
            {entry["id"] for entry in catalog},
            {"created", "edited", "deleted", "read", "test.external:entity.created"},
        )

    def test_fixture_custom_action_dispatches_and_persists_once(self):
        response = self.client.post(
            "/api/actions/",
            self.payload(action="test.external:entity.created"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ActionLogEntry.objects.count(), 1)
        row = ActionLogEntry.objects.get()
        self.assertEqual(row.action, "test.external:entity.created")
        self.assertEqual(row.action_type, "created")
        self.assertEqual(row.initiating_mod_id, "external")

    def test_missing_required_fields_are_rejected(self):
        response = self.client.post("/api/actions/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(
            {"action", "action_type", "target_type", "target_id", "workspace_id"}
            .issubset(response.data)
        )
        self.assertEqual(ActionLogEntry.objects.count(), 0)

    def test_non_integer_target_id_is_rejected(self):
        response = self.client.post(
            "/api/actions/", self.payload(target_id="not-an-integer"), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ActionLogEntry.objects.count(), 0)

    def test_unknown_action_is_rejected_without_audit_write(self):
        response = self.client.post(
            "/api/actions/",
            self.payload(action="test.external:entity.unknown"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ActionLogEntry.objects.count(), 0)

    def test_read_is_authorization_only_and_never_persisted(self):
        response = self.client.post(
            "/api/actions/",
            self.payload(action="read", action_type="read"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("read", str(response.data).lower())
        self.assertEqual(ActionLogEntry.objects.count(), 0)

    def test_denied_target_mutation_leaves_audit_state_unchanged(self):
        reader = User.objects.create_user(username="action_reader", password="pass")
        Grant.objects.create(
            project=self.project, user=reader, role=ProjectRole.READ
        )
        client = APIClient()
        client.force_authenticate(user=reader)

        response = client.post("/api/actions/", self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ActionLogEntry.objects.count(), 0)

    def test_missing_target_is_denied_without_audit_write(self):
        response = self.client.post(
            "/api/actions/",
            self.payload(target_id=self.target.pk + 10000),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ActionLogEntry.objects.count(), 0)

    def test_request_id_and_client_ip_are_persisted(self):
        request_id = "550e8400-e29b-41d4-a716-446655440000"
        response = self.client.post(
            "/api/actions/",
            self.payload(request_id=request_id),
            format="json",
            REMOTE_ADDR="10.0.0.42",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        row = ActionLogEntry.objects.get()
        self.assertEqual(row.request_id, UUID(request_id))
        self.assertEqual(row.client_ip, "10.0.0.42")

    def test_unauthenticated_request_is_rejected(self):
        self.client.force_authenticate(user=None)

        response = self.client.post("/api/actions/", self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_content_target_does_not_require_project_grant(self):
        user = User.objects.create_user(username="no_grant", password="pass")
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(
            "/api/actions/",
            self.payload(target_type="external.asset", target_id=91),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ActionLogEntry.objects.get().target_type, "external.asset")
