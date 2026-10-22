from uuid import uuid4
import json
from pathlib import Path
from unittest.mock import patch

from django.contrib.contenttypes.models import ContentType
from django.test import override_settings

from helix_core.core.tests.base import BaseTestCase
from helix_core.models import ActionLogEntry, ActionParticipant, PlatformRecord, RetainedContract, ScientificRevision
from helix_core.mod_system.contracts import contract_fingerprint, canonical_json
from helix_core.mod_system.registry import BackendModRegistry
from helix_core.mod_system.manifest import ModManifest
from helix_core.public import ModRegistrar
from helix_core.record_persistence import ProposedEffects
from mods.eln.models import ContentVersion, NotebookEntry
from mods.eln.tests.factories import TEXT_DOC, get_or_create_default_eln_schema


@override_settings(ROOT_URLCONF="mods.eln.tests.urls")
class PlatformDocumentSaveTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.backend_registry = BackendModRegistry()
        self.registry_patch = patch("helix_core.mod_system.registry.registry", self.backend_registry)
        self.registry_patch.start()
        get_or_create_default_eln_schema()
        self.client.force_authenticate(user=self.user)
        package_root = Path(__file__).resolve().parents[1]
        for path in (package_root / "contracts").glob("*.json"):
            envelope = json.loads(path.read_text(encoding="utf-8"))
            RetainedContract.objects.update_or_create(
                kind=envelope["kind"], contract_id=envelope["id"], version=envelope["version"],
                defaults={
                    "fingerprint": contract_fingerprint(envelope),
                    "canonical_envelope": canonical_json(envelope).decode("utf-8"),
                },
            )

    def tearDown(self):
        self.registry_patch.stop()
        super().tearDown()

    def create_entry(self):
        response = self.client.post(
            "/api/eln/entries/",
            {
                "name": "Notebook document",
                "content": TEXT_DOC,
                "source_type": ContentType.objects.get_for_model(self.folder).pk,
                "source_id": self.folder.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_actual_entry_save_persists_portable_revision_and_shared_activity(self):
        created = self.create_entry()
        entry = NotebookEntry.objects.get(pk=created["id"])
        record = PlatformRecord.objects.get(pk=entry.platform_record_id)
        group = record.revision_groups.get(group_key="document")
        self.assertEqual(group.revisions.count(), 1)
        self.assertEqual(group.current_revision.snapshot["document"], TEXT_DOC)
        self.assertEqual(created["document_group_id"], str(group.pk))
        self.assertEqual(created["document_revision_id"], str(group.current_revision_id))
        self.assertEqual(created["platform_record_id"], str(record.pk))
        self.assertEqual(created["platform_record_revision_id"], str(record.revision_groups.get(group_key="record").current_revision_id))
        self.assertEqual(set(created["platform_schema_state"]), {"schemaId", "schemaHash", "schemaTypeId", "schemaTypeHash", "mappingHash"})

        edited_document = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Narrative context"}]},
                {"type": "registry-table", "attrs": {
                    "id": "registry-1", "title": "Saved samples",
                    "columns": [{"id": "field-sequence", "name": "Sequence", "type": "text"}],
                    "rows": [{
                        "entityId": None, "displayId": "#new-1", "__name": "Sample A",
                        "values": {"Sequence": "AACCGG"}, "isRegistered": False,
                        "lastRegisteredValueHash": None, "registrationError": None,
                    }],
                    "actionSequence": {
                        "fingerprint": "sequence-v1",
                        "steps": [{"id": "register", "action": {"kind": "action", "id": "helix.register", "version": "1.0.0"},
                                   "inputs": {"rows": {"kind": "block", "blockId": "registry-1", "path": ["rows"]}},
                                   "parameters": {}, "targets": {"record": "entry"}}],
                    },
                    "nestedPortableValue": {"vendor": {"future": [1, {"binding": "exact-v3"}]}},
                }},
            ],
        }
        request_id = uuid4()
        updated = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {
                "name": "Notebook document",
                "content": edited_document,
                "state_token": created["platform_state_token"],
                "request_id": str(request_id),
            },
            format="json",
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertNotEqual(updated.data["platform_state_token"], created["platform_state_token"])
        self.assertNotEqual(updated.data["document_revision_id"], created["document_revision_id"])
        self.assertEqual(group.revisions.count(), 2)
        self.assertEqual(ContentVersion.objects.filter(entry=entry).count(), 0)

        reloaded = self.client.get(f"/api/eln/entries/{entry.display_id}/")
        self.assertEqual(reloaded.status_code, 200, reloaded.data)
        self.assertEqual(reloaded.data["content"], edited_document)
        action = ActionLogEntry.objects.get(
            target_model_reference="eln.entry",
            target_object_id=str(entry.pk),
            metadata__revision_id=updated.data["document_revision_id"],
        )
        self.assertEqual(action.metadata["group_id"], updated.data["document_group_id"])

    def test_shared_action_invocation_records_exact_committed_document_input(self):
        created = self.create_entry()
        entry = NotebookEntry.objects.get(pk=created["id"])
        envelope = {
            "formatVersion": 1, "kind": "action", "id": "fixture.eln.inspect-document",
            "version": "1.0.0", "description": "Inspect one saved ELN document",
            "definition": {
                "inputs": {}, "parameters": {}, "outputs": {},
                "targets": {"record": "helix.record"}, "effects": {"record": "edited"},
            },
        }
        RetainedContract.objects.create(
            kind="action", contract_id=envelope["id"], version=envelope["version"],
            fingerprint=contract_fingerprint(envelope),
            canonical_envelope=canonical_json(envelope).decode("utf-8"),
        )
        registrar = ModRegistrar(ModManifest(
            id="fixture.eln", display_name="Fixture ELN Action", version="1.0.0",
            requires_helix=">=1.0.0", artifacts=("backend",), depends_on=(),
        ), self.backend_registry)
        action_ref = registrar.register_record_action(
            "inspect-document", label="Inspect document",
            action_contract_id=envelope["id"], action_contract_version=envelope["version"],
            handler=lambda _context, _inputs: ProposedEffects(metadata={"inspection": "complete"}, outputs={}),
        )
        payload = {
            "invocationId": "eln-document-run-1",
            "sequenceFingerprint": "retained-sequence-fingerprint",
            "inputs": {}, "parameters": {},
            "targets": {"record": created["platform_record_id"]},
            "expectedState": {"record": {
                "stateToken": created["platform_state_token"],
                "revisionId": created["platform_record_revision_id"],
                "schemaState": created["platform_schema_state"],
                "documentGroupId": created["document_group_id"],
                "documentRevisionId": created["document_revision_id"],
            }},
            "providers": {"action": action_ref.id},
        }
        response = self.client.post("/api/action-invocations/", payload, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        action = ActionLogEntry.objects.get(pk=response.data["actionId"])
        self.assertEqual(action.metadata["source_document"], {
            "record_id": created["platform_record_id"],
            "group_id": created["document_group_id"],
            "revision_id": created["document_revision_id"],
        })
        self.assertTrue(ActionParticipant.objects.filter(
            action=action, target_model_reference="eln.entry", target_object_id=str(entry.pk),
            role="document_input",
        ).exists())

        # A lost response is recovered by the same stable invocation identity.
        recovered = self.client.post("/api/action-invocations/", payload, format="json")
        self.assertEqual(recovered.status_code, 200, recovered.data)
        self.assertTrue(recovered.data["replayed"])
        self.assertEqual(recovered.data["actionId"], response.data["actionId"])

    def test_name_only_save_logs_without_creating_document_revision(self):
        created = self.create_entry()
        entry = NotebookEntry.objects.get(pk=created["id"])
        record = PlatformRecord.objects.get(pk=entry.platform_record_id)
        group = record.revision_groups.get(group_key="document")
        response = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {
                "name": "Renamed notebook",
                "content": TEXT_DOC,
                "state_token": created["platform_state_token"],
                "request_id": str(uuid4()),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(group.revisions.count(), 1)
        self.assertEqual(response.data["document_revision_id"], created["document_revision_id"])
        self.assertNotEqual(response.data["platform_state_token"], created["platform_state_token"])
        self.assertTrue(ActionLogEntry.objects.filter(
            target_model_reference="eln.entry", target_object_id=str(entry.pk),
            metadata__group_key="document", metadata__revision_changed=False,
        ).exists())

    def test_stale_save_is_rejected_without_claiming_the_old_revision(self):
        created = self.create_entry()
        entry = NotebookEntry.objects.get(pk=created["id"])
        edit = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {
                "name": entry.name,
                "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "new"}]}]},
                "state_token": created["platform_state_token"],
                "request_id": str(uuid4()),
            },
            format="json",
        )
        self.assertEqual(edit.status_code, 200, edit.data)
        revisions_before = ScientificRevision.objects.count()
        stale = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {
                "name": entry.name,
                "content": TEXT_DOC,
                "state_token": created["platform_state_token"],
                "request_id": str(uuid4()),
            },
            format="json",
        )
        self.assertEqual(stale.status_code, 409, stale.data)
        self.assertEqual(ScientificRevision.objects.count(), revisions_before)
