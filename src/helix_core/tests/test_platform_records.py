"""Public record API contracts for Mod-independent scientific persistence."""

from unittest.mock import patch
from uuid import UUID, uuid4
import hashlib
import shutil
import tempfile

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from django.contrib.contenttypes.models import ContentType

from bundled.access.access.models import (
    Grant,
    Organization,
    OrganizationMembership,
    OrganizationRole,
    ProjectRole,
)
from helix_core.core.models import Folder, Project, User
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
        from django.core.files.storage import FileSystemStorage

        self.attachment_storage_path = tempfile.mkdtemp(prefix="helix-attachments-")
        self.attachment_storage_patch = patch(
            "helix_core.attachments.default_storage",
            FileSystemStorage(location=self.attachment_storage_path),
        )
        self.attachment_storage_patch.start()
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
        self.attachment_storage_patch.stop()
        shutil.rmtree(self.attachment_storage_path, ignore_errors=True)
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

    def test_attachment_upload_is_project_scoped_and_download_requires_retained_revision(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from helix_core.models import PlatformAttachment

        upload = self.client.post(
            f"/api/projects/{self.project.pk}/attachments/",
            {"file": SimpleUploadedFile("first.txt", b"immutable original", content_type="text/plain")},
            format="multipart",
        )
        self.assertEqual(upload.status_code, 201, upload.data)
        attachment_id = upload.data["id"]
        self.assertEqual(upload.data["sha256"], hashlib.sha256(b"immutable original").hexdigest())
        self.assertEqual(PlatformAttachment.objects.get(pk=attachment_id).status, "staged")

        self.schema.schema_type.columns = [{"id": "file", "name": "File", "type": "attachmentReference"}]
        self.schema.schema_type.save()
        created = self.client.post("/api/records/", self.create_payload(
            field_values={"file": {"type": "attachmentReference", "value": {"id": attachment_id}}},
        ), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        old_revision = created.data["revision"]["id"]
        self.assertEqual(created.data["attachments"][0]["sha256"], upload.data["sha256"])
        self.assertEqual(created.data["attachments"][0]["downloadUrl"],
                         f"/api/records/{created.data['id']}/attachments/{attachment_id}/content/?revision_id={old_revision}")
        attachment = PlatformAttachment.objects.get(pk=attachment_id)
        self.assertEqual(attachment.status, "complete")

        content = self.client.get(
            f"/api/records/{created.data['id']}/attachments/{attachment_id}/content/?revision_id={old_revision}"
        )
        self.assertEqual(content.status_code, 200, getattr(content, "data", None))
        self.assertEqual(b"".join(content.streaming_content), b"immutable original")

        replacement = self.client.post(
            f"/api/projects/{self.project.pk}/attachments/",
            {"file": SimpleUploadedFile("second.txt", b"replacement", content_type="text/plain")},
            format="multipart",
        )
        self.assertEqual(replacement.status_code, 201, replacement.data)
        edit = self.client.post(f"/api/records/{created.data['id']}/form/", {
            "state_token": created.data["state_token"],
            "request_id": str(uuid4()),
            "field_values": {"file": {"type": "attachmentReference", "value": {"id": replacement.data["id"]}}},
        }, format="json")
        self.assertEqual(edit.status_code, 200, edit.data)
        old_again = self.client.get(
            f"/api/records/{created.data['id']}/attachments/{attachment_id}/content/?revision_id={old_revision}"
        )
        self.assertEqual(old_again.status_code, 200)
        self.assertEqual(b"".join(old_again.streaming_content), b"immutable original")
        unavailable_from_replacement = self.client.get(
            f"/api/records/{created.data['id']}/attachments/{attachment_id}/content/?revision_id={edit.data['revision']['id']}"
        )
        self.assertEqual(unavailable_from_replacement.status_code, 404)
        exported = self.client.get(f"/api/records/{created.data['id']}/export/?group_id={created.data['revision']['group_id']}&revision_id={old_revision}")
        self.assertEqual(exported.status_code, 200, exported.data)
        self.assertEqual(exported.data["attachments"][0]["sha256"], upload.data["sha256"])

        outsider = User.objects.create_user(username="attachment_reader", password="pass")
        denied = APIClient()
        denied.force_authenticate(user=outsider)
        denied.raise_request_exception = False
        denied_response = denied.get(
            f"/api/records/{created.data['id']}/attachments/{attachment_id}/content/?revision_id={old_revision}"
        )
        self.assertEqual(denied_response.status_code, 403)

    def test_corrupt_or_missing_attachment_cannot_be_committed_or_downloaded_silently(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from helix_core.models import PlatformAttachment, PlatformRecord

        uploaded = self.client.post(
            f"/api/projects/{self.project.pk}/attachments/",
            {"file": SimpleUploadedFile("missing.txt", b"expected", content_type="text/plain")},
            format="multipart",
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.data)
        row = PlatformAttachment.objects.get(pk=uploaded.data["id"])
        from helix_core.attachments import default_storage as storage
        storage.delete(row.storage_key)
        self.schema.schema_type.columns = [{"id": "file", "name": "File", "type": "attachmentReference"}]
        self.schema.schema_type.save()
        before_records = PlatformRecord.objects.count()
        failed = self.client.post("/api/records/", self.create_payload(
            field_values={"file": {"type": "attachmentReference", "value": {"id": uploaded.data["id"]}}},
        ), format="json")
        self.assertEqual(failed.status_code, 400, failed.data)
        self.assertEqual(PlatformRecord.objects.count(), before_records)

        valid = self.client.post(
            f"/api/projects/{self.project.pk}/attachments/",
            {"file": SimpleUploadedFile("corrupt.txt", b"original", content_type="text/plain")},
            format="multipart",
        )
        created = self.client.post("/api/records/", self.create_payload(
            field_values={"file": {"type": "attachmentReference", "value": {"id": valid.data["id"]}}},
        ), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        row = PlatformAttachment.objects.get(pk=valid.data["id"])
        storage.delete(row.storage_key)
        storage.save(row.storage_key, SimpleUploadedFile("changed", b"changed"))
        corrupt = self.client.get(
            f"/api/records/{created.data['id']}/attachments/{row.pk}/content/?revision_id={created.data['revision']['id']}"
        )
        self.assertEqual(corrupt.status_code, 500)

    def test_attachment_upload_enforces_stream_limit_and_project_access(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings
        from rest_framework.test import APIClient

        with override_settings(PLATFORM_ATTACHMENT_MAX_BYTES=3):
            too_large = self.client.post(
                f"/api/projects/{self.project.pk}/attachments/",
                {"file": SimpleUploadedFile("large.bin", b"four", content_type="application/octet-stream")},
                format="multipart",
            )
        self.assertEqual(too_large.status_code, 413, too_large.data)

        truncated = SimpleUploadedFile("truncated.bin", b"short", content_type="application/octet-stream")
        truncated.size = 10
        from rest_framework.exceptions import ValidationError
        from helix_core.attachments import upload_attachment
        with self.assertRaises(ValidationError):
            upload_attachment(project=self.project, actor=self.user, uploaded_file=truncated)

        outsider = User.objects.create_user(username="attachment_outsider", password="pass")
        denied = APIClient()
        denied.force_authenticate(user=outsider)
        denied.raise_request_exception = False
        response = denied.post(
            f"/api/projects/{self.project.pk}/attachments/",
            {"file": SimpleUploadedFile("denied.txt", b"secret", content_type="text/plain")},
            format="multipart",
        )
        self.assertEqual(response.status_code, 403)

    def test_audit_failure_rolls_back_attachment_link_and_record_save(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from helix_core.models import AttachmentRevisionLink, PlatformAttachment, PlatformRecord

        staged = self.client.post(
            f"/api/projects/{self.project.pk}/attachments/",
            {"file": SimpleUploadedFile("rollback.txt", b"rollback", content_type="text/plain")},
            format="multipart",
        )
        self.assertEqual(staged.status_code, 201, staged.data)
        self.schema.schema_type.columns = [{"id": "file", "name": "File", "type": "attachmentReference"}]
        self.schema.schema_type.save()
        before = PlatformRecord.objects.count()
        with patch("helix_core.record_persistence._write_action", side_effect=RuntimeError("audit failed")):
            response = self.client.post("/api/records/", self.create_payload(
                field_values={"file": {"type": "attachmentReference", "value": {"id": staged.data["id"]}}},
            ), format="json")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(PlatformRecord.objects.count(), before)
        attachment = PlatformAttachment.objects.get(pk=staged.data["id"])
        self.assertEqual(attachment.status, "staged")
        self.assertEqual(AttachmentRevisionLink.objects.filter(attachment=attachment).count(), 0)

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

    def test_public_record_readers_paginate_history_and_require_exact_revision_ownership(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        record_id = created.data["id"]
        revision_one = created.data["revision"]["id"]
        changed = self.client.post(f"/api/records/{record_id}/form/", {
            "state_token": created.data["state_token"],
            "request_id": str(uuid4()),
            "field_values": {"field-concentration": {"type": "number", "value": 2.5}},
        }, format="json")
        group_id = changed.data["revision"]["group_id"]

        page = self.client.get(
            f"/api/records/{record_id}/groups/{group_id}/revisions/?page=1&page_size=1"
        )
        self.assertEqual(page.status_code, 200, page.data)
        self.assertEqual(page.data["count"], 2)
        self.assertEqual(len(page.data["results"]), 1)
        self.assertIsNotNone(page.data["next"])

        exact = self.client.get(
            f"/api/records/{record_id}/groups/{group_id}/revisions/{revision_one}/"
        )
        self.assertEqual(exact.status_code, 200, exact.data)
        self.assertEqual(exact.data["snapshot"]["field_values"]["field-concentration"]["value"], 1.25)
        self.assertEqual(self.client.get(
            f"/api/records/{record_id}/groups/{uuid4()}/revisions/{revision_one}/"
        ).status_code, 404)

    def test_current_record_query_count_and_activity_are_subject_scoped(self):
        first = self.client.post("/api/records/", self.create_payload(), format="json")
        second = self.client.post("/api/records/", self.create_payload(name="Sample B"), format="json")
        page = self.client.get("/api/records/?page=1&page_size=1")
        self.assertEqual(page.status_code, 200, page.data)
        self.assertEqual(page.data["count"], 2)
        self.assertEqual(len(page.data["results"]), 1)

        activity = self.client.get(f"/api/records/{first.data['id']}/actions/")
        self.assertEqual(activity.status_code, 200, activity.data)
        self.assertEqual(activity.data["count"], 1)
        self.assertEqual(activity.data["results"][0]["subject"]["roles"], ["subject"])
        self.assertNotEqual(activity.data["results"][0]["subject"]["id"], second.data["id"])

    def test_current_history_and_export_apply_target_record_access(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        record_id = created.data["id"]
        group_id = created.data["revision"]["group_id"]
        outsider = User.objects.create_user(username="record_outsider", password="pass")
        self.client.force_authenticate(user=outsider)

        self.assertEqual(self.client.get(f"/api/records/{record_id}/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/records/{record_id}/groups/{group_id}/revisions/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/records/{record_id}/export/").status_code, 403)
        self.assertEqual(self.client.get("/api/records/").data["count"], 0)

    def test_export_includes_exact_definition_closure_without_resolving_references(self):
        nested = {
            "formatVersion": 1, "kind": "data", "id": "fixture.science.unit-value",
            "version": "1.0.0", "description": "Unit value",
            "definition": {"type": {"type": "quantity", "valueType": "number", "unit": "mg/L", "description": "Mass concentration"}},
        }
        root = {
            "formatVersion": 1, "kind": "data", "id": "fixture.science.measurement",
            "version": "1.0.0", "description": "Measurement",
            "definition": {"type": {"type": "object", "fields": {
                "amount": {"type": "contract", "kind": "data", "id": nested["id"], "version": "1.0.0"},
                "sample": {"type": "recordReference"},
            }}},
        }
        for envelope in (nested, root):
            RetainedContract.objects.create(
                kind="data", contract_id=envelope["id"], version=envelope["version"],
                fingerprint=contract_fingerprint(envelope),
                canonical_envelope=canonical_json(envelope).decode("utf-8"),
            )
        schema_type = self.schema.schema_type
        schema_type.columns = [{"id": "field-measurement", "name": "Measurement", "type": "contract", "contract": {
            "kind": "data", "id": root["id"], "version": "1.0.0",
        }}]
        schema_type.save()
        record = self.client.post("/api/records/", self.create_payload(field_values={
            "field-measurement": {"type": "contract", "contract": {"kind": "data", "id": root["id"], "version": "1.0.0"}, "value": {
                "amount": {"value": 2.5}, "sample": {"id": "inaccessible-target", "revision": "exact-revision"},
            }},
        }), format="json")
        self.assertEqual(record.status_code, 201, record.data)

        exported = self.client.get(f"/api/records/{record.data['id']}/export/")
        self.assertEqual(exported.status_code, 200, exported.data)
        self.assertEqual(exported.data["formatVersion"], 1)
        self.assertEqual({item["id"] for item in exported.data["definitions"]}, {root["id"], nested["id"]})
        self.assertEqual(exported.data["record"]["field_values"]["field-measurement"]["value"]["sample"]["id"], "inaccessible-target")
        self.assertEqual(exported.data["attachments"], [])
        self.assertTrue(exported.data["capabilities"]["attachmentMetadata"]["available"])
        self.assertFalse(exported.data["capabilities"]["viewer"]["available"])

    def test_attachment_cleanup_removes_expired_stages_and_keeps_revision_links(self):
        from datetime import timedelta
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.utils import timezone
        from helix_core.attachments import cleanup_staged_attachments
        from helix_core.models import PlatformAttachment

        first = self.client.post(
            f"/api/projects/{self.project.pk}/attachments/",
            {"file": SimpleUploadedFile("retained.txt", b"retained", content_type="text/plain")},
            format="multipart",
        )
        staged = self.client.post(
            f"/api/projects/{self.project.pk}/attachments/",
            {"file": SimpleUploadedFile("orphan.txt", b"orphan", content_type="text/plain")},
            format="multipart",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(staged.status_code, 201)
        self.schema.schema_type.columns = [{"id": "file", "name": "File", "type": "attachmentReference"}]
        self.schema.schema_type.save()
        record = self.client.post("/api/records/", self.create_payload(
            field_values={"file": {"type": "attachmentReference", "value": {"id": first.data["id"]}}},
        ), format="json")
        self.assertEqual(record.status_code, 201, record.data)
        old = timezone.now() - timedelta(days=2)
        PlatformAttachment.objects.filter(pk__in=[first.data["id"], staged.data["id"]]).update(created_at=old)

        self.assertEqual(cleanup_staged_attachments(), 1)
        self.assertTrue(PlatformAttachment.objects.filter(pk=first.data["id"]).exists())
        self.assertFalse(PlatformAttachment.objects.filter(pk=staged.data["id"]).exists())
        deleted = self.client.delete(f"/api/records/{record.data['id']}/")
        self.assertEqual(deleted.status_code, 204)
        PlatformAttachment.objects.filter(pk=first.data["id"]).update(unreferenced_at=old)
        self.assertEqual(cleanup_staged_attachments(), 1)
        self.assertFalse(PlatformAttachment.objects.filter(pk=first.data["id"]).exists())

    def test_schema_rename_remove_and_retype_keep_saved_values_and_bindings(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        old_value = created.data["field_values"]["field-concentration"]
        self.user.is_superuser = True
        self.user.save(update_fields=["is_superuser"])
        renamed = self.client.patch(f"/api/schemas/{self.schema.pk}/", {
            "columns": [{"id": "field-concentration", "name": "Amount", "type": "number"}],
        }, format="json")
        self.assertEqual(renamed.status_code, 200, renamed.data)
        retyped = self.client.patch(f"/api/schemas/{self.schema.pk}/", {
            "columns": [{"id": "field-concentration", "name": "Amount", "type": "text"}],
        }, format="json")
        self.assertEqual(retyped.status_code, 200, retyped.data)
        removed = self.client.patch(f"/api/schemas/{self.schema.pk}/", {"columns": []}, format="json")
        self.assertEqual(removed.status_code, 200, removed.data)

        current = self.client.get(f"/api/records/{created.data['id']}/")
        self.assertEqual(current.status_code, 200, current.data)
        self.assertEqual(current.data["field_values"]["field-concentration"], old_value)
        history = self.client.get(
            f"/api/records/{created.data['id']}/groups/{created.data['revision']['group_id']}/revisions/{created.data['revision']['id']}/"
        )
        self.assertEqual(history.status_code, 200, history.data)
        self.assertEqual(history.data["snapshot"]["field_values"]["field-concentration"], old_value)

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
        exact = self.client.get(
            f"/api/records/{response.data['id']}/groups/{response.data['revision']['group_id']}/revisions/{response.data['revision']['id']}/"
        )
        self.assertEqual(exact.status_code, 200, exact.data)
        self.assertEqual(
            exact.data["snapshot"]["field_values"]["field-concentration"]["contract"],
            {"kind": "data", "id": envelope["id"], "version": "1.0.0"},
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

        legacy_request = {
            "record_id": created.data["id"],
            "action": "fixture.science:edit-record",
            "contract_id": action_contract["id"],
            "contract_version": "1.0.0",
            "state_token": created.data["state_token"],
            "request_id": str(uuid4()),
            "inputs": {"concentration": 5.5},
        }
        response = self.client.post("/api/actions/execute/", legacy_request, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["field_values"]["field-concentration"]["value"], 5.5)
        self.assertEqual(response.data["revision"]["sequence"], 2)
        action = ActionLogEntry.objects.order_by("-pk").first()
        self.assertEqual(action.action, "fixture.science:edit-record")
        self.assertEqual(action.initiating_mod_id, "fixture.science")
        self.backend_registry._record_actions.pop("fixture.science:edit-record")
        retry = self.client.post("/api/actions/execute/", legacy_request, format="json")
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(retry.data, response.data)
        self.assertEqual(ActionLogEntry.objects.count(), 2)

    def test_action_invocation_returns_actor_scoped_recoverable_outcome(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        action_contract = {
            "formatVersion": 1, "kind": "action", "id": "fixture.science.edit-record",
            "version": "1.0.0", "description": "Edit a scientific record",
            "definition": {
                "inputs": {"concentration": {"type": "number"}}, "parameters": {},
                "outputs": {"concentration": {"type": "number"}},
                "targets": {"record": "helix.record"}, "effects": {"record": "edited"},
            },
        }
        RetainedContract.objects.create(
            kind="action", contract_id=action_contract["id"], version="1.0.0",
            fingerprint=contract_fingerprint(action_contract),
            canonical_envelope=canonical_json(action_contract).decode("utf-8"),
        )
        registrar = ModRegistrar(ModManifest(
            id="fixture.science", display_name="Fixture Science", version="1.0.0",
            requires_helix=">=1.0.0", artifacts=("backend",), depends_on=(),
        ), self.backend_registry)
        registrar.register_record_action(
            "edit-record", label="Edit record", action_contract_id=action_contract["id"],
            action_contract_version="1.0.0",
            handler=lambda context, inputs: ProposedEffects(field_values={
                "field-concentration": {"type": "number", "value": inputs["concentration"]},
            }, outputs={"concentration": {"type": "number", "value": inputs["concentration"]}}),
        )
        invocation = {
            "invocationId": "lab-run-2026-17",
            "inputs": {"concentration": 5.5},
            "parameters": {},
            "targets": {"record": created.data["id"]},
            "expectedState": {"record": {
                "stateToken": created.data["state_token"],
                "revisionId": created.data["revision"]["id"],
                "schemaState": created.data["schema_state"],
            }},
            "providers": {"action": "fixture.science:edit-record"},
        }
        invocation["sequenceFingerprint"] = "client-sequence-fingerprint"

        invalid_inputs = {**invocation, "invocationId": "invalid-inputs", "inputs": {"concentration": "high"}}
        invalid = self.client.post("/api/action-invocations/", invalid_inputs, format="json")
        self.assertEqual(invalid.status_code, 422, invalid.data)
        self.assertEqual(ActionLogEntry.objects.count(), 1)

        first = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.data["invocationId"], invocation["invocationId"])
        self.assertFalse(first.data["replayed"])
        self.assertEqual(first.data["participants"][0]["after"]["sequence"], 2)
        self.assertEqual(first.data["outputs"]["concentration"]["value"], 5.5)

        # A retained receipt works without loading an executable provider.
        self.backend_registry._record_actions.pop("fixture.science:edit-record")

        # Replay is a receipt lookup: it remains available after later edits and
        # does not invoke the provider or manufacture a new Action.
        later = self.client.post(f"/api/records/{created.data['id']}/form/", {
            "state_token": first.data["participants"][0]["after"]["stateToken"],
            "request_id": str(uuid4()),
            "field_values": {"field-concentration": {"type": "number", "value": 9.0}},
        }, format="json")
        self.assertEqual(later.status_code, 200, later.data)
        replay = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertTrue(replay.data["replayed"])
        self.assertEqual(replay.data["actionId"], first.data["actionId"])
        self.assertEqual(ActionLogEntry.objects.count(), 3)
        recovered = self.client.get("/api/action-invocations/lab-run-2026-17/")
        self.assertEqual(recovered.status_code, 200, recovered.data)
        self.assertTrue(recovered.data["replayed"])
        self.assertEqual(recovered.data["actionId"], first.data["actionId"])
        Grant.objects.filter(project=self.project, user=self.user).delete()
        denied_recovery = self.client.get("/api/action-invocations/lab-run-2026-17/")
        self.assertEqual(denied_recovery.status_code, 403)
        Grant.objects.create(project=self.project, user=self.user, role=ProjectRole.EDIT)
        deleted = self.client.delete(f"/api/records/{created.data['id']}/")
        self.assertEqual(deleted.status_code, 204, deleted.data)
        missing_recovery = self.client.get("/api/action-invocations/lab-run-2026-17/")
        self.assertEqual(missing_recovery.status_code, 200, missing_recovery.data)
        self.assertTrue(missing_recovery.data["participants"][0]["targetUnavailable"])
        missing_retry = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(missing_retry.status_code, 200, missing_retry.data)
        self.assertTrue(missing_retry.data["participants"][0]["targetUnavailable"])
        self.assertEqual(PlatformRecord.objects.count(), 0)
        self.assertEqual(ScientificRevision.objects.count(), 0)
        self.assertEqual(ActionLogEntry.objects.count(), 4)

        changed = {**invocation, "inputs": {"concentration": 8.5}}
        conflict = self.client.post("/api/action-invocations/", changed, format="json")
        self.assertEqual(conflict.status_code, 409, conflict.data)

    def test_account_deletion_preserves_record_history_and_actor_snapshots(self):
        self.user.first_name = "Researcher"
        self.user.save(update_fields=["first_name"])
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        revision = ScientificRevision.objects.get()
        action = ActionLogEntry.objects.order_by("pk").first()
        actor_name = self.user.username

        organization = Organization.objects.create(name="Record Lab")
        administrator = User.objects.create_user(username="record_admin", password="pass")
        OrganizationMembership.objects.update_or_create(
            user=administrator,
            defaults={"organization": organization, "role": OrganizationRole.ADMIN},
        )
        OrganizationMembership.objects.update_or_create(
            user=self.user,
            defaults={"organization": organization, "role": OrganizationRole.USER},
        )
        self.client.force_authenticate(user=administrator)
        deletion = self.client.delete(f"/api/core/users/{self.user.pk}/")
        self.assertEqual(deletion.status_code, 204, getattr(deletion, "data", None))

        record = PlatformRecord.objects.get(pk=created.data["id"])
        revision.refresh_from_db()
        action.refresh_from_db()
        self.assertIsNone(record.author_id)
        self.assertIsNone(revision.created_by_id)
        self.assertIsNone(action.performed_by_id)
        self.assertEqual(record.author_snapshot["username"], actor_name)
        self.assertEqual(revision.created_by_snapshot["username"], actor_name)
        self.assertEqual(action.performed_by_snapshot["username"], actor_name)
        self.assertEqual(action.performed_by_snapshot["displayName"], "Researcher")

        observer = User.objects.create_user(username="record_observer", password="pass")
        Grant.objects.create(project=self.project, user=observer, role=ProjectRole.READ)
        self.client.force_authenticate(user=observer)
        record_response = self.client.get(f"/api/records/{created.data['id']}/")
        self.assertEqual(record_response.status_code, 200, record_response.data)
        self.assertEqual(record_response.data["author"]["displayName"], "Researcher")
        revisions = self.client.get(f"/api/records/{created.data['id']}/revisions/")
        self.assertEqual(revisions.status_code, 200, revisions.data)
        self.assertEqual(revisions.data["groups"][0]["revisions"][0]["created_by"]["username"], actor_name)
        activity = self.client.get(f"/api/records/{created.data['id']}/actions/")
        self.assertEqual(activity.status_code, 200, activity.data)
        self.assertEqual(activity.data["results"][0]["performed_by"]["displayName"], "Researcher")

    def test_deleting_source_folder_removes_record_descendants_and_history(self):
        folder = Folder.objects.create(
            name="Retained research",
            project=self.project,
            source_type=ContentType.objects.get_for_model(Project),
            source_id=self.project.pk,
        )
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        record = PlatformRecord.objects.get(pk=created.data["id"])
        record.source_type = ContentType.objects.get_for_model(Folder)
        record.source_id = folder.pk
        record.save(update_fields=["source_type", "source_id"])

        deleted = self.client.delete(f"/api/core/folders/{folder.pk}/")

        self.assertEqual(deleted.status_code, 204, getattr(deleted, "data", None))
        self.assertFalse(PlatformRecord.objects.filter(pk=record.pk).exists())
        self.assertEqual(ScientificRevision.objects.count(), 0)
        deletion_action = ActionLogEntry.objects.get(action="helix.record.deleted")
        self.assertEqual(deletion_action.target_object_id, str(record.pk))

    def test_read_only_project_member_cannot_delete_record(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        reader = User.objects.create_user(username="record_reader", password="pass")
        Grant.objects.create(project=self.project, user=reader, role=ProjectRole.READ)
        self.client.force_authenticate(user=reader)

        response = self.client.delete(f"/api/records/{created.data['id']}/")

        self.assertEqual(response.status_code, 403)
        self.assertTrue(PlatformRecord.objects.filter(pk=created.data["id"]).exists())
        self.assertEqual(ScientificRevision.objects.count(), 1)
        self.assertEqual(ActionLogEntry.objects.count(), 1)

    def test_action_invocation_requires_current_record_and_expected_schema_state(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        self.schema.columns = [{"id": "field-concentration", "name": "Changed", "type": "number"}]
        self.schema.save()
        response = self.client.post("/api/action-invocations/", {
            "invocationId": "stale-run",
            "sequenceFingerprint": "stale-sequence",
            "inputs": {}, "parameters": {},
            "targets": {"record": created.data["id"]},
            "expectedState": {"record": {
                "stateToken": created.data["state_token"],
                "revisionId": created.data["revision"]["id"],
                "schemaState": created.data["schema_state"],
            }},
            "providers": {"action": "missing:provider"},
        }, format="json")
        self.assertEqual(response.status_code, 409, response.data)

    def test_action_invocation_enforces_nested_payload_limit(self):
        created = self.client.post("/api/records/", self.create_payload(), format="json")
        too_deep = []
        for _ in range(65):
            too_deep = [too_deep]
        response = self.client.post("/api/action-invocations/", {
            "invocationId": "too-deep",
            "sequenceFingerprint": "deep-sequence",
            "inputs": {"nested": too_deep}, "parameters": {},
            "targets": {"record": created.data["id"]},
            "expectedState": {"record": {
                "stateToken": created.data["state_token"],
                "revisionId": created.data["revision"]["id"],
                "schemaState": created.data["schema_state"],
            }},
            "providers": {"action": "missing:provider"},
        }, format="json")
        self.assertEqual(response.status_code, 413, response.data)

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
