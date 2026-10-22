"""Public record API contracts for Mod-independent scientific persistence."""

from unittest.mock import patch
from uuid import UUID, uuid4

from django.test import TestCase
from rest_framework.test import APIClient

from bundled.access.access.models import Grant, ProjectRole
from helix_core.core.models import Project, User
from helix_core.models import (
    ActionLogEntry,
    PlatformRecord,
    RetainedContract,
    Schema,
    SchemaType,
    ScientificRevision,
)
from helix_core.mod_system.contracts import canonical_json, contract_fingerprint
from helix_core.mod_system.registry import BackendModRegistry
from helix_core.mod_system.manifest import ModManifest
from helix_core.public import ModRegistrar
from helix_core.record_persistence import ProposedEffects


class PlatformRecordApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="record_editor", password="pass")
        self.project = Project.objects.create(name="Record Project")
        Grant.objects.create(project=self.project, user=self.user, role=ProjectRole.EDIT)
        schema_type = SchemaType.objects.create(
            display_name="Assay",
            workspace_id="fixture.science",
            model="platform.record",
            columns=[{"id": "field-concentration", "name": "Concentration", "type": "number"}],
        )
        self.schema = Schema.objects.create(
            name="Assay schema", prefix="ASSAY", schema_type=schema_type
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.raise_request_exception = False
        self.backend_registry = BackendModRegistry()
        self.registry_patch = patch("helix_core.mod_system.registry.registry", self.backend_registry)
        self.registry_patch.start()

    def tearDown(self):
        self.registry_patch.stop()
        super().tearDown()

    def create_payload(self, **overrides):
        payload = {
            "name": "Sample A",
            "project_id": self.project.pk,
            "schema_id": self.schema.pk,
            "field_values": {"field-concentration": {"type": "number", "value": 1.25}},
        }
        payload.update(overrides)
        return payload

    def test_create_returns_platform_identity_initial_revision_and_authoritative_action(self):
        response = self.client.post("/api/records/", self.create_payload(), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        record_id = UUID(response.data["id"])
        self.assertTrue(response.data["display_id"].startswith("ASSAY"))
        self.assertEqual(response.data["field_values"]["field-concentration"]["value"], 1.25)
        self.assertEqual(response.data["revision"]["sequence"], 1)
        self.assertEqual(ActionLogEntry.objects.count(), 1)
        action = ActionLogEntry.objects.get()
        self.assertEqual(action.target_model_reference, "helix.record")
        self.assertEqual(action.target_object_id, str(record_id))
        self.assertEqual(action.action_type, "created")

        listing = self.client.get("/api/records/")
        self.assertEqual(listing.data["count"], 1)
        self.assertEqual(listing.data["results"][0]["id"], str(record_id))

    def test_metadata_only_and_unchanged_value_writes_rotate_state_without_revision(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        record_id = created.data["id"]
        original_revision = created.data["revision"]["id"]
        original_token = created.data["state_token"]
        metadata = self.client.post(f"/api/records/{record_id}/form/", {
            "state_token": original_token,
            "request_id": str(uuid4()),
            "metadata": {"review": "checked"},
        }, format="json")

        self.assertEqual(metadata.status_code, 200, metadata.data)
        self.assertNotEqual(metadata.data["state_token"], original_token)
        self.assertEqual(metadata.data["revision"]["id"], original_revision)
        unchanged = self.client.post(f"/api/records/{record_id}/form/", {
            "state_token": metadata.data["state_token"],
            "request_id": str(uuid4()),
            "field_values": {"field-concentration": {"type": "number", "value": 1.25}},
        }, format="json")
        self.assertEqual(unchanged.status_code, 200, unchanged.data)
        self.assertNotEqual(unchanged.data["state_token"], metadata.data["state_token"])
        self.assertEqual(unchanged.data["revision"]["id"], original_revision)
        self.assertEqual(ScientificRevision.objects.count(), 1)

    def test_a_b_a_values_make_distinct_revisions_with_matching_first_and_last_hashes(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        first_hash = created.data["revision"]["content_hash"]
        token = created.data["state_token"]
        record_id = created.data["id"]
        outcomes = []
        for value in (2.5, 1.25):
            response = self.client.post(f"/api/records/{record_id}/form/", {
                "state_token": token,
                "request_id": str(uuid4()),
                "field_values": {"field-concentration": {"type": "number", "value": value}},
            }, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            outcomes.append(response.data)
            token = response.data["state_token"]
        self.assertEqual(outcomes[0]["revision"]["sequence"], 2)
        self.assertEqual(outcomes[1]["revision"]["sequence"], 3)
        self.assertEqual(outcomes[1]["revision"]["content_hash"], first_hash)
        self.assertNotEqual(created.data["revision"]["id"], outcomes[1]["revision"]["id"])

    def test_revision_history_is_read_only_and_exposes_immutable_snapshots(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        response = self.client.get(f"/api/records/{created.data['id']}/revisions/")

        self.assertEqual(response.status_code, 200)
        revision = response.data["groups"][0]["revisions"][0]
        self.assertEqual(revision["snapshot"]["field_values"]["field-concentration"]["value"], 1.25)
        self.assertEqual(
            self.client.put(f"/api/records/{created.data['id']}/revisions/", {}, format="json").status_code,
            405,
        )

    def test_form_edit_creates_one_revision_and_same_request_returns_saved_outcome(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        record_id = created.data["id"]
        state_token = created.data["state_token"]
        request_id = "a0a0a0a0-0000-4000-8000-000000000001"
        payload = {
            "state_token": state_token,
            "request_id": request_id,
            "field_values": {"field-concentration": {"type": "number", "value": 2.5}},
        }

        first = self.client.post(f"/api/records/{record_id}/form/", payload, format="json")
        retry = self.client.post(f"/api/records/{record_id}/form/", payload, format="json")

        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(first.data, retry.data)
        self.assertEqual(first.data["revision"]["sequence"], 2)
        self.assertEqual(ActionLogEntry.objects.count(), 2)

    def test_snapshot_failure_rolls_back_record_and_action(self):
        with patch("helix_core.record_persistence.create_initial_snapshot", side_effect=RuntimeError("snapshot failed")):
            response = self.client.post("/api/records/", self.create_payload(), format="json")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(ActionLogEntry.objects.count(), 0)
        self.assertEqual(PlatformRecord.objects.count(), 0)

    def test_audit_failure_rolls_back_record_and_snapshot(self):
        with patch("helix_core.record_persistence._write_action", side_effect=RuntimeError("audit failed")):
            response = self.client.post("/api/records/", self.create_payload(), format="json")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(PlatformRecord.objects.count(), 0)
        self.assertEqual(ScientificRevision.objects.count(), 0)
        self.assertEqual(ActionLogEntry.objects.count(), 0)

    def test_contract_typed_field_keeps_and_checks_exact_retained_version(self):
        envelope = {
            "formatVersion": 1, "kind": "data", "id": "fixture.science.concentration",
            "version": "1.0.0", "description": "Concentration",
            "definition": {"type": {"type": "number"}},
        }
        RetainedContract.objects.create(
            kind="data", contract_id=envelope["id"], version=envelope["version"],
            fingerprint=contract_fingerprint(envelope),
            canonical_envelope=canonical_json(envelope).decode("utf-8"),
        )
        schema_type = self.schema.schema_type
        schema_type.columns = [{
            "id": "field-concentration",
            "name": "Concentration",
            "type": "contract",
            "contract": {"kind": "data", "id": envelope["id"], "version": "1.0.0"},
        }]
        schema_type.save()

        response = self.client.post("/api/records/", self.create_payload(field_values={
            "field-concentration": {
                "type": "contract",
                "contract": {"kind": "data", "id": envelope["id"], "version": "1.0.0"},
                "value": 1.25,
            },
        }), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            response.data["field_values"]["field-concentration"]["contract"]["version"],
            "1.0.0",
        )

        invalid = self.client.post("/api/records/", self.create_payload(field_values={
            "field-concentration": {
                "type": "contract",
                "contract": {"kind": "data", "id": envelope["id"], "version": "2.0.0"},
                "value": 1.25,
            },
        }), format="json")
        self.assertEqual(invalid.status_code, 400, invalid.data)
        self.assertEqual(PlatformRecord.objects.count(), 1)

    def test_registered_action_provider_edits_record_through_atomic_boundary(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        action_contract = {
            "formatVersion": 1,
            "kind": "action",
            "id": "fixture.science.edit-record",
            "version": "1.0.0",
            "description": "Edit a scientific record",
            "definition": {
                "inputs": {"concentration": {"type": "number"}},
                "parameters": {},
                "outputs": {},
                "targets": {"record": "helix.record"},
                "effects": {"record": "edited"},
            },
        }
        RetainedContract.objects.create(
            kind="action",
            contract_id=action_contract["id"],
            version=action_contract["version"],
            fingerprint=contract_fingerprint(action_contract),
            canonical_envelope=canonical_json(action_contract).decode("utf-8"),
        )
        manifest = ModManifest(
            id="fixture.science", display_name="Fixture Science", version="1.0.0",
            requires_helix=">=1.0.0", artifacts=("backend",), depends_on=(),
        )
        registrar = ModRegistrar(manifest, self.backend_registry)
        registrar.register_record_action(
            "edit-record",
            label="Edit record",
            action_contract_id=action_contract["id"],
            action_contract_version="1.0.0",
            handler=lambda context, inputs: ProposedEffects(field_values={
                "field-concentration": {"type": "number", "value": inputs["concentration"]},
            }),
        )

        response = self.client.post("/api/actions/execute/", {
            "record_id": created.data["id"],
            "action": "fixture.science:edit-record",
            "contract_id": action_contract["id"],
            "contract_version": "1.0.0",
            "state_token": created.data["state_token"],
            "request_id": str(uuid4()),
            "inputs": {"concentration": 5.5},
        }, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["field_values"]["field-concentration"]["value"], 5.5)
        self.assertEqual(response.data["revision"]["sequence"], 2)
        action = ActionLogEntry.objects.order_by("-pk").first()
        self.assertEqual(action.action, "fixture.science:edit-record")
        self.assertEqual(action.initiating_mod_id, "fixture.science")

    def test_legacy_action_log_cannot_create_a_separate_record_success_path(self):
        response = self.client.post("/api/actions/", {
            "action": "helix.record.edited",
            "action_type": "edited",
            "target_type": "helix.record",
            "target_id": 1,
            "workspace_id": "helix",
        }, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(ActionLogEntry.objects.count(), 0)
