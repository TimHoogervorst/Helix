"""Public record API contracts for Mod-independent scientific persistence."""

import json
from unittest.mock import patch
from copy import deepcopy
from uuid import UUID, uuid4
import hashlib
import shutil
import tempfile

from django.db import transaction
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
    ActionParticipant,
    PlatformRecord,
    PlatformAttachment,
    PlatformRendition,
    AttachmentRevisionLink,
    RetainedContract,
    Schema,
    SchemaType,
    ScientificRevision,
)
from helix_core.mod_system.contracts import canonical_json, contract_fingerprint
from helix_core.mod_system.registry import BackendModRegistry
from helix_core.mod_system.manifest import ModManifest
from helix_core.public import ModRegistrar, create_record, save_revision_group, retain_rendition
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

    def test_mod_document_group_save_returns_committed_revision_and_shared_action(self):
        created = create_record(
            actor=self.user, project=self.project, schema=self.schema,
            name="ELN document", field_values={}, request_id=uuid4(),
        )
        document = {"type": "doc", "content": [{"type": "paragraph"}]}
        request_id = uuid4()
        first = save_revision_group(
            actor=self.user, record_id=created["id"], group_key="document",
            state_token=created["state_token"], request_id=request_id,
            snapshot={"document": document},
            target_model_reference="eln.entry", target_object_id="42",
        )

        replay = save_revision_group(
            actor=self.user, record_id=created["id"], group_key="document",
            state_token=created["state_token"], request_id=request_id,
            snapshot={"document": document},
            target_model_reference="eln.entry", target_object_id="42",
        )
        self.assertEqual(replay, first)
        group = PlatformRecord.objects.get(pk=created["id"]).revision_groups.get(group_key="document")
        self.assertEqual(group.target_model_reference, "eln.entry")
        self.assertEqual(str(group.current_revision_id), first["revision_id"])
        self.assertEqual(group.current_revision.snapshot["document"], document)
        action = ActionLogEntry.objects.get(pk=first["action"]["id"])
        self.assertEqual(action.target_model_reference, "eln.entry")
        self.assertEqual(action.target_object_id, "42")
        self.assertEqual(action.metadata["group_id"], first["group_id"])
        self.assertEqual(action.metadata["revision_id"], first["revision_id"])

        renamed = save_revision_group(
            actor=self.user, record_id=created["id"], group_key="document",
            state_token=first["state_token"], request_id=uuid4(),
            snapshot={"document": document},
            target_model_reference="eln.entry", target_object_id="42",
            record_name="Renamed ELN document",
        )
        self.assertFalse(renamed["revision_changed"])
        self.assertEqual(renamed["revision_id"], first["revision_id"])
        self.assertNotEqual(renamed["state_token"], first["state_token"])
        self.assertEqual(group.revisions.count(), 1)

        from helix_core.record_persistence import StateConflict
        with self.assertRaises(StateConflict):
            save_revision_group(
                actor=self.user, record_id=created["id"], group_key="document",
                state_token=first["state_token"], request_id=uuid4(),
                snapshot={"document": {"type": "doc", "content": []}},
                target_model_reference="eln.entry", target_object_id="42",
            )

    def test_platform_rendition_is_independent_of_eln_owned_tables(self):
        created = create_record(actor=self.user, project=self.project, schema=self.schema,
                                name="Retained document", field_values={}, request_id=uuid4())
        saved = save_revision_group(actor=self.user, record_id=created["id"], group_key="document",
                                    state_token=created["state_token"], request_id=uuid4(),
                                    snapshot={"document": {"type": "doc", "content": []}},
                                    target_model_reference="fixture.document", target_object_id="one")
        from django.core.files.base import ContentFile
        from helix_core.attachments import default_storage
        storage_key = default_storage.save("platform-attachments/rendition-test.pdf", ContentFile(b"pdf"))
        attachment = PlatformAttachment.objects.create(
            project=self.project, created_by=self.user, storage_key=storage_key,
            filename="review.pdf", media_type="application/pdf", size=3,
            sha256=hashlib.sha256(b"pdf").hexdigest(), status="complete")
        revision = ScientificRevision.objects.get(pk=saved["revision_id"])
        AttachmentRevisionLink.objects.create(revision=revision, attachment=attachment)
        rendition = retain_rendition(
            record_id=created["id"], group_id=saved["group_id"], revision_id=revision.pk,
            attachment_id=attachment.pk, source_hash=revision.content_hash, actor=self.user,
            captured_at=revision.created_at, presentation_provider="fixture.renderer",
            presentation_version="1.0.0", presentation_context={"format": "pdf"})

        self.assertTrue(PlatformRendition.objects.filter(pk=rendition.pk).exists())
        self.assertNotIn("eln", {field.related_model._meta.app_label for field in PlatformRendition._meta.fields
                                 if field.is_relation and field.related_model})
        from helix_core.attachments import rendition_metadata
        result = rendition_metadata(record_id=created["id"], revision_id=revision.pk)
        self.assertEqual(result[0]["source_hash"], revision.content_hash)
        self.assertEqual(result[0]["presentation_provider"], "fixture.renderer")
        self.assertEqual(result[0]["rendition_hash"], attachment.sha256)
        from django.apps import apps
        from django.db import connection
        self.assertFalse(apps.is_installed("mods.eln"))
        self.assertNotIn("eln_historical_rendition", connection.introspection.table_names())
        self.assertEqual(rendition_metadata(record_id=created["id"], revision_id=revision.pk)[0]["id"], str(rendition.pk))
        self.assertIn("revision_id=", result[0]["download_url"])
        record = PlatformRecord.objects.get(pk=created["id"])
        record.delete()
        self.assertFalse(PlatformRendition.objects.filter(pk=rendition.pk).exists())
        attachment.refresh_from_db()
        self.assertIsNotNone(attachment.unreferenced_at)

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

    def test_exact_record_reference_uses_historical_type_after_schema_field_changes(self):
        from helix_core.record_persistence import _resolve_record_source

        cases = (
            ("retyped", [{"id": "field-concentration", "name": "Concentration", "type": "string"}]),
            ("removed", []),
        )
        for suffix, current_columns in cases:
            with self.subTest(schema_change=suffix):
                self.schema.schema_type.columns = [
                    {"id": "field-concentration", "name": "Concentration", "type": "number"},
                ]
                self.schema.schema_type.save()
                source = self.client.post(
                    "/api/records/",
                    self.create_payload(name=f"Historical {suffix}", field_values={
                        "field-concentration": {"type": "number", "value": 1.25},
                    }),
                    format="json",
                )
                self.assertEqual(source.status_code, 201, source.data)
                self.schema.schema_type.columns = current_columns
                self.schema.schema_type.save()
                with transaction.atomic():
                    value, participant = _resolve_record_source(
                        self.user,
                        {"kind": "record", "reference": {
                            "mode": "exact",
                            "entityId": source.data["id"],
                            "groupId": source.data["revision"]["group_id"],
                            "revisionId": source.data["revision"]["id"],
                            "fieldId": "field-concentration",
                        }},
                        {"type": "number"},
                        "measurement",
                    )
                self.assertEqual(value, 1.25)
                self.assertEqual(str(participant["revision"].pk), source.data["revision"]["id"])

    def test_exact_record_reference_preserves_historical_contract_binding_after_field_removal(self):
        from helix_core.record_persistence import _resolve_record_source

        envelope = {
            "formatVersion": 1, "kind": "data", "id": "fixture.science.exact-measurement",
            "version": "1.0.0", "description": "Exact measurement",
            "definition": {"type": {"type": "object", "fields": {
                "amount": {"type": "number"},
            }}},
        }
        RetainedContract.objects.create(
            kind="data", contract_id=envelope["id"], version=envelope["version"],
            fingerprint=contract_fingerprint(envelope),
            canonical_envelope=canonical_json(envelope).decode("utf-8"),
        )
        binding = {"kind": "data", "id": envelope["id"], "version": envelope["version"]}
        self.schema.schema_type.columns = [{
            "id": "field-concentration", "name": "Concentration", "type": "contract",
            "contract": binding,
        }]
        self.schema.schema_type.save()
        source = self.client.post(
            "/api/records/",
            self.create_payload(name="Bound historical value", field_values={
                "field-concentration": {"type": "contract", "contract": binding, "value": {"amount": 1.25}},
            }),
            format="json",
        )
        self.assertEqual(source.status_code, 201, source.data)
        self.schema.schema_type.columns = []
        self.schema.schema_type.save()

        with transaction.atomic():
            value, _ = _resolve_record_source(
                self.user,
                {"kind": "record", "reference": {
                    "mode": "exact", "entityId": source.data["id"],
                    "groupId": source.data["revision"]["group_id"],
                    "revisionId": source.data["revision"]["id"],
                    "fieldId": "field-concentration",
                }},
                {"type": "contract", **binding},
                "measurement",
            )
        self.assertEqual(value, {"amount": 1.25})

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

    def test_recursive_document_contract_validates_nested_blocks_and_opaque_attributes(self):
        from helix_core.record_persistence import _validate_contract_value
        from rest_framework.exceptions import ValidationError

        definitions = {
            "helix.eln.document": {
                "type": "object",
                "fields": {
                    "type": {"type": "string", "enum": ["doc"]},
                    "content": {"type": "array", "items": {
                        "type": "contract", "kind": "data",
                        "id": "helix.eln.block", "version": "1.0.0",
                    }},
                },
                "optionalFields": {"attrs": {"type": "json"}},
            },
            "helix.eln.block": {
                "type": "object",
                "fields": {"type": {"type": "string", "minLength": 1}},
                "optionalFields": {
                    "attrs": {"type": "json"},
                    "content": {"type": "array", "items": {
                        "type": "contract", "kind": "data",
                        "id": "helix.eln.block", "version": "1.0.0",
                    }},
                    "text": {"type": "string"},
                    "marks": {"type": "array", "items": {
                        "type": "contract", "kind": "data",
                        "id": "helix.eln.mark", "version": "1.0.0",
                    }},
                },
                "additionalValues": {"type": "json"},
            },
            "helix.eln.mark": {
                "type": "object",
                "fields": {"type": {"type": "string", "minLength": 1}},
                "optionalFields": {"attrs": {"type": "json"}},
            },
        }
        RetainedContract.objects.filter(
            kind="data",
            contract_id__in=definitions,
            version="1.0.0",
        ).delete()
        for contract_id, definition in definitions.items():
            envelope = {
                "formatVersion": 1, "kind": "data", "id": contract_id,
                "version": "1.0.0", "description": "Test retained document schema.",
                "definition": {"type": definition},
            }
            RetainedContract.objects.create(
                kind="data", contract_id=contract_id, version="1.0.0",
                fingerprint=contract_fingerprint(envelope),
                canonical_envelope=canonical_json(envelope).decode("utf-8"),
            )

        document_type = {
            "type": "contract", "kind": "data",
            "id": "helix.eln.document", "version": "1.0.0",
        }
        value = {
            "type": "doc",
            "attrs": {"source": ["external", {"version": 7}]},
            "content": [{
                "type": "paragraph", "attrs": {"vendor": {"key": True}},
                "content": [{"type": "text", "text": "hello", "marks": [
                    {"type": "highlight", "attrs": {"color": "violet"}},
                ]}],
            }],
        }
        _validate_contract_value(document_type, value, "document")

        invalid = {**value, "type": "unsupported-document"}
        with self.assertRaises(ValidationError):
            _validate_contract_value(document_type, invalid, "document")

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
        capability = self.backend_registry.get_registry_payload()["recordActions"]
        self.assertIn({
            "id": "fixture.science:edit-record",
            "label": "Edit record",
            "contract_id": action_contract["id"],
            "contract_version": "1.0.0",
            "provider_mod_id": "fixture.science",
            "provider_mod_version": "1.0.0",
        }, capability)
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

    def test_action_invocation_commits_created_records_and_document_revision_as_one_action(self):
        source = self.client.post("/api/records/", self.create_payload(name="Saved table"), format="json")
        self.assertEqual(source.status_code, 201, source.data)
        table_rows = [{
            "displayId": "#new-1", "entityId": None, "__name": "Registered sample",
            "values": {"Concentration": 8.5}, "isRegistered": False,
        }]
        document_group = save_revision_group(
            actor=self.user,
            record_id=source.data["id"],
            group_key="document",
            state_token=source.data["state_token"],
            request_id=uuid4(),
            snapshot={"document": {"type": "doc", "content": [{"type": "registry-table", "attrs": {
                "id": "registry-1", "schemaId": self.schema.pk,
                "columns": [{"id": "field-concentration", "name": "Concentration", "type": "number"}],
                "rows": table_rows,
            }}]}},
            target_model_reference="eln.entry",
            target_object_id="entry-17",
        )
        contract = {
            "formatVersion": 1, "kind": "action", "id": "fixture.science.register-rows",
            "version": "1.0.0", "description": "Register saved rows",
            "definition": {
                "inputs": {"rows": {"type": "json"}}, "parameters": {
                    "schemaId": {"type": "number"}, "fieldMapping": {"type": "json"},
                    "blockId": {"type": "string"},
                },
                "outputs": {"created": {"type": "json"}},
                "targets": {"record": "helix.record"},
                "effects": {"record": "edited", "records": "created", "document": "edited"},
            },
        }
        RetainedContract.objects.create(
            kind="action", contract_id=contract["id"], version="1.0.0",
            fingerprint=contract_fingerprint(contract),
            canonical_envelope=canonical_json(contract).decode("utf-8"),
        )
        registrar = ModRegistrar(ModManifest(
            id="fixture.science", display_name="Fixture Science", version="1.0.0",
            requires_helix=">=1.0.0", artifacts=("backend",), depends_on=(),
        ), self.backend_registry)
        from bundled.lims.actions import propose_registry_registration
        provider = registrar.register_record_action(
            "register-rows", label="Register saved rows",
            action_contract_id=contract["id"], action_contract_version="1.0.0",
            handler=propose_registry_registration,
        )
        invocation = {
            "invocationId": "register-invocation-17", "sequenceFingerprint": "register-sequence-v1",
            "inputs": {"rows": table_rows}, "parameters": {
                "schemaId": self.schema.pk,
                "fieldMapping": {"field-concentration": "field-concentration"},
                "blockId": "registry-1",
            },
            "targets": {"record": source.data["id"]},
            "expectedState": {"record": {
                "stateToken": document_group["state_token"],
                "revisionId": source.data["revision"]["id"],
                "schemaState": source.data["schema_state"],
                "documentGroupId": document_group["group_id"],
                "documentRevisionId": document_group["revision_id"],
            }},
            "providers": {"action": provider.id},
        }
        before_actions = ActionLogEntry.objects.count()
        result = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(ActionLogEntry.objects.count(), before_actions + 1)
        created_record = PlatformRecord.objects.exclude(pk=source.data["id"]).get()
        self.assertEqual(created_record.name, "Registered sample")
        self.assertEqual(created_record.field_values["field-concentration"]["value"], 8.5)
        saved_document = PlatformRecord.objects.get(pk=source.data["id"]).revision_groups.get(group_key="document").current_revision.snapshot
        saved_row = saved_document["document"]["content"][0]["attrs"]["rows"][0]
        self.assertEqual(saved_row["entityId"], str(created_record.pk))
        self.assertEqual(saved_row["displayId"], created_record.display_id)
        self.assertTrue(saved_row["isRegistered"])
        action = ActionLogEntry.objects.get(pk=result.data["actionId"])
        self.assertEqual(ActionParticipant.objects.filter(action=action).count(), 2)
        self.assertTrue(ActionParticipant.objects.filter(
            action=action, target_model_reference="eln.entry", target_object_id="entry-17",
        ).exists())
        self.assertEqual(result.data["participants"][1]["after"]["sequence"], 1)
        replay = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertTrue(replay.data["replayed"])
        self.assertEqual(replay.data["actionId"], result.data["actionId"])
        self.assertEqual(PlatformRecord.objects.count(), 2)

    def test_registration_preserves_serialized_editor_block_and_created_references(self):
        # Exercise the real session-authenticated request.user lazy wrapper.
        self.client.force_authenticate(user=None)
        self.client.force_login(self.user)
        source = self.client.post("/api/records/", self.create_payload(name="Saved table"), format="json")
        self.assertEqual(source.status_code, 201, source.data)
        table_rows = [{
            "displayId": "#new-1", "entityId": None, "__name": "Registered sample",
            "values": {"Concentration": 8.5}, "isRegistered": False,
        }]
        document_group = save_revision_group(
            actor=self.user,
            record_id=source.data["id"],
            group_key="document",
            state_token=source.data["state_token"],
            request_id=uuid4(),
            snapshot={"document": {"type": "doc", "content": [{"type": "helix.lims:registry-table", "attrs": {"content": json.dumps({
                "id": "registry-1", "schemaId": self.schema.pk,
                "columns": [{"id": "field-concentration", "name": "Concentration", "type": "number"}],
                "rows": table_rows,
            })}}]}},
            target_model_reference="eln.entry",
            target_object_id="entry-17",
        )
        contract = {
            "formatVersion": 1, "kind": "action", "id": "fixture.science.register-rows",
            "version": "1.0.0", "description": "Register saved rows",
            "definition": {
                "inputs": {"rows": {"type": "json"}}, "parameters": {
                    "schemaId": {"type": "number"}, "fieldMapping": {"type": "json"},
                    "blockId": {"type": "string"},
                },
                "outputs": {"created": {"type": "json"}},
                "targets": {"record": "helix.record"},
                "effects": {"record": "edited", "records": "created", "document": "edited"},
            },
        }
        RetainedContract.objects.create(
            kind="action", contract_id=contract["id"], version="1.0.0",
            fingerprint=contract_fingerprint(contract),
            canonical_envelope=canonical_json(contract).decode("utf-8"),
        )
        registrar = ModRegistrar(ModManifest(
            id="fixture.science", display_name="Fixture Science", version="1.0.0",
            requires_helix=">=1.0.0", artifacts=("backend",), depends_on=(),
        ), self.backend_registry)
        from bundled.lims.actions import propose_registry_registration
        provider = registrar.register_record_action(
            "register-rows", label="Register saved rows",
            action_contract_id=contract["id"], action_contract_version="1.0.0",
            handler=propose_registry_registration,
        )
        invocation = {
            "invocationId": "register-invocation-17", "sequenceFingerprint": "register-sequence-v1",
            "inputs": {"rows": table_rows}, "parameters": {
                "schemaId": self.schema.pk,
                "fieldMapping": {"field-concentration": "field-concentration"},
                "blockId": "registry-1",
            },
            "targets": {"record": source.data["id"]},
            "expectedState": {"record": {
                "stateToken": document_group["state_token"],
                "revisionId": source.data["revision"]["id"],
                "schemaState": source.data["schema_state"],
                "documentGroupId": document_group["group_id"],
                "documentRevisionId": document_group["revision_id"],
            }},
            "providers": {"action": provider.id},
        }
        before_actions = ActionLogEntry.objects.count()
        result = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(ActionLogEntry.objects.count(), before_actions + 1)
        created_record = PlatformRecord.objects.exclude(pk=source.data["id"]).get()
        self.assertEqual(created_record.name, "Registered sample")
        self.assertEqual(created_record.field_values["field-concentration"]["value"], 8.5)
        saved_document = PlatformRecord.objects.get(pk=source.data["id"]).revision_groups.get(group_key="document").current_revision.snapshot
        saved_row = json.loads(saved_document["document"]["content"][0]["attrs"]["content"])["rows"][0]
        self.assertEqual(saved_row["entityId"], str(created_record.pk))
        self.assertEqual(saved_row["displayId"], created_record.display_id)
        self.assertTrue(saved_row["isRegistered"])
        action = ActionLogEntry.objects.get(pk=result.data["actionId"])
        self.assertEqual(ActionParticipant.objects.filter(action=action).count(), 2)
        self.assertTrue(ActionParticipant.objects.filter(
            action=action, target_model_reference="eln.entry", target_object_id="entry-17",
        ).exists())
        self.assertEqual(result.data["participants"][1]["after"]["sequence"], 1)
        replay = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertTrue(replay.data["replayed"])
        self.assertEqual(replay.data["actionId"], result.data["actionId"])
        self.assertEqual(PlatformRecord.objects.count(), 2)

    def test_action_invocation_rolls_back_all_created_records_when_one_row_fails(self):
        created = self.client.post("/api/records/", self.create_payload(name="Saved table"), format="json")
        contract = {
            "formatVersion": 1, "kind": "action", "id": "fixture.science.register-invalid-rows",
            "version": "1.0.0", "description": "Register rows",
            "definition": {
                "inputs": {}, "parameters": {}, "outputs": {},
                "targets": {"record": "helix.record"},
                "effects": {"record": "edited", "records": "created"},
            },
        }
        RetainedContract.objects.create(
            kind="action", contract_id=contract["id"], version="1.0.0",
            fingerprint=contract_fingerprint(contract),
            canonical_envelope=canonical_json(contract).decode("utf-8"),
        )
        registrar = ModRegistrar(ModManifest(
            id="fixture.science", display_name="Fixture Science", version="1.0.0",
            requires_helix=">=1.0.0", artifacts=("backend",), depends_on=(),
        ), self.backend_registry)
        registrar.register_record_action(
            "register-invalid-rows", label="Register rows",
            action_contract_id=contract["id"], action_contract_version="1.0.0",
            handler=lambda _context, _inputs: ProposedEffects(creates=[
                {"key": "row-1", "name": "Would succeed", "schema_id": self.schema.pk,
                 "field_values": {"field-concentration": {"type": "number", "value": 1.0}}},
                {"key": "row-2", "name": "Must roll back", "schema_id": self.schema.pk,
                 "field_values": {"unknown-field": {"type": "number", "value": 2.0}}},
            ]),
        )
        invocation = {
            "invocationId": "register-invalid-17", "sequenceFingerprint": "register-sequence-v1",
            "inputs": {}, "parameters": {}, "targets": {"record": created.data["id"]},
            "expectedState": {"record": {
                "stateToken": created.data["state_token"], "revisionId": created.data["revision"]["id"],
                "schemaState": created.data["schema_state"],
            }},
            "providers": {"action": "fixture.science:register-invalid-rows"},
        }
        before_actions = ActionLogEntry.objects.count()
        result = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(result.status_code, 422, result.data)
        self.assertEqual(PlatformRecord.objects.count(), 1)
        self.assertEqual(ScientificRevision.objects.count(), 1)
        self.assertEqual(ActionLogEntry.objects.count(), before_actions)

    def test_composed_action_sequence_feeds_saved_producer_output_into_registration_once(self):
        source = self.client.post("/api/records/", self.create_payload(name="Composed table"), format="json")
        rows = [{
            "displayId": "#new-composed", "entityId": None, "__name": "Composed sample",
            "values": {"Concentration": 4.25}, "isRegistered": False,
        }]
        sequence_declaration = {
            "fingerprint": "fixture.saved-produce-register.v1",
            "steps": [
                {"id": "produce", "action": {"kind": "action", "id": "fixture.science.saved-row-producer", "version": "1.0.0"},
                 "inputs": {
                     "rows": {"kind": "block", "blockId": "registry-composed", "path": ["rows"]},
                     "check": {"kind": "literal", "value": {"type": {"type": "number"}, "value": 7}},
                     "measurement": {"kind": "record", "reference": {
                         "mode": "exact", "entityId": source.data["id"],
                         "groupId": source.data["revision"]["group_id"],
                         "revisionId": source.data["revision"]["id"],
                         "fieldId": "field-concentration",
                     }},
                     "currentMeasurement": {"kind": "record", "reference": {
                         "mode": "current", "entityId": source.data["id"],
                         "fieldId": "field-concentration",
                     }},
                 }, "parameters": {}, "targets": {"record": "record"}},
                {"id": "register", "action": {"kind": "action", "id": "helix.lims.registry-register", "version": "1.0.0"},
                 "inputs": {"rows": {"kind": "step", "stepId": "produce", "port": "rows"}},
                 "parameters": {
                     "schemaId": {"type": {"type": "number"}, "value": self.schema.pk},
                     "fieldMapping": {"type": {"type": "json"}, "value": {"field-concentration": "field-concentration"}},
                     "blockId": {"type": {"type": "string"}, "value": "registry-composed"},
                 }, "targets": {"record": "record"}},
            ],
        }
        document_group = save_revision_group(
            actor=self.user, record_id=source.data["id"], group_key="document",
            state_token=source.data["state_token"], request_id=uuid4(),
            snapshot={"document": {"type": "doc", "content": [{"type": "registry-table", "attrs": {
                "id": "registry-composed", "schemaId": self.schema.pk,
                "columns": [{"id": "field-concentration", "name": "Concentration", "type": "number"}],
                "rows": rows, "actionSequence": sequence_declaration,
            }}]}},
            target_model_reference="eln.entry", target_object_id="entry-composed",
        )
        producer_contract = {
            "formatVersion": 1, "kind": "action", "id": "fixture.science.saved-row-producer",
            "version": "1.0.0", "description": "Read saved fixture rows once",
            "definition": {
                "inputs": {
                    "rows": {"type": "json"}, "check": {"type": "number"},
                    "measurement": {"type": "number"}, "currentMeasurement": {"type": "number"},
                },
                "parameters": {}, "outputs": {"rows": {"type": "json"}},
                "targets": {"record": "helix.record"}, "effects": {"record": "edited"},
            },
        }
        RetainedContract.objects.create(
            kind="action", contract_id=producer_contract["id"], version="1.0.0",
            fingerprint=contract_fingerprint(producer_contract),
            canonical_envelope=canonical_json(producer_contract).decode("utf-8"),
        )
        registrar = ModRegistrar(ModManifest(
            id="fixture.science", display_name="Fixture Science", version="1.0.0",
            requires_helix=">=1.0.0", artifacts=("backend",), depends_on=(),
        ), self.backend_registry)
        producer_calls = []
        producer_measurements = []

        def to_json(value):
            if hasattr(value, "items"):
                return {key: to_json(item) for key, item in value.items()}
            if isinstance(value, (list, tuple)):
                return [to_json(item) for item in value]
            return value

        def produce_saved_rows(context, _inputs):
            producer_calls.append(context["step_id"])
            producer_measurements.append(_inputs["measurement"])
            return ProposedEffects(outputs={"rows": {"type": "json", "value": to_json(_inputs["rows"])}})

        producer = registrar.register_record_action(
            "saved-row-producer", label="Fixture row producer",
            action_contract_id=producer_contract["id"], action_contract_version="1.0.0",
            handler=produce_saved_rows,
        )
        from bundled.lims.actions import ACTION_CONTRACT_ID, ACTION_CONTRACT_VERSION, propose_registry_registration
        RetainedContract.objects.get(kind="action", contract_id=ACTION_CONTRACT_ID, version=ACTION_CONTRACT_VERSION)
        registration = registrar.register_record_action(
            "register-saved-rows", label="Register saved rows",
            action_contract_id=ACTION_CONTRACT_ID, action_contract_version=ACTION_CONTRACT_VERSION,
            handler=propose_registry_registration,
        )
        invocation = {
            "invocationId": "composed-register-1", "sequenceFingerprint": "fixture.saved-produce-register.v1",
            "sequenceDeclaration": sequence_declaration,
            "inputs": {}, "parameters": {}, "targets": {"record": source.data["id"]},
            "expectedState": {"record": {
                "stateToken": document_group["state_token"],
                "revisionId": source.data["revision"]["id"],
                "schemaState": source.data["schema_state"],
                "documentGroupId": document_group["group_id"],
                "documentRevisionId": document_group["revision_id"],
            }},
            "providers": {"steps": {"produce": producer.id, "register": registration.id}},
            "steps": [
                {"id": "produce", "inputs": {
                    "rows": rows, "check": 7, "measurement": 1.25, "currentMeasurement": 1.25,
                }, "parameters": {}},
                {"id": "register", "inputs": {"rows": {"kind": "step", "stepId": "produce", "port": "rows"}},
                 "parameters": {
                     "schemaId": self.schema.pk,
                     "fieldMapping": {"field-concentration": "field-concentration"},
                     "blockId": "registry-composed",
                 }},
            ],
        }
        mismatched = deepcopy(invocation)
        mismatched["invocationId"] = "composed-sequence-mismatch"
        mismatched["sequenceDeclaration"]["steps"][0]["id"] = "altered"
        self.assertEqual(self.client.post("/api/action-invocations/", mismatched, format="json").status_code, 422)
        substituted_block = deepcopy(invocation)
        substituted_block["invocationId"] = "composed-block-substitution"
        substituted_block["steps"][0]["inputs"]["rows"][0]["values"]["Concentration"] = 999
        self.assertEqual(self.client.post("/api/action-invocations/", substituted_block, format="json").status_code, 422)
        substituted_literal = deepcopy(invocation)
        substituted_literal["invocationId"] = "composed-literal-substitution"
        substituted_literal["steps"][0]["inputs"]["check"] = 999
        self.assertEqual(self.client.post("/api/action-invocations/", substituted_literal, format="json").status_code, 422)
        self.assertEqual(producer_calls, [])
        unknown_step = deepcopy(invocation)
        unknown_step["invocationId"] = "composed-unknown-step"
        unknown_step["steps"][0]["id"] = "unknown"
        self.assertEqual(self.client.post("/api/action-invocations/", unknown_step, format="json").status_code, 422)
        provider = self.backend_registry._record_actions.pop(producer.id)
        removed = deepcopy(invocation)
        removed["invocationId"] = "composed-provider-removed"
        self.assertEqual(self.client.post("/api/action-invocations/", removed, format="json").status_code, 503)
        self.backend_registry._record_actions[producer.id] = provider
        replacement = deepcopy(provider)
        replacement["action_contract_id"] = "helix.lims.registry-register"
        self.backend_registry._record_actions[producer.id] = replacement
        replaced = deepcopy(invocation)
        replaced["invocationId"] = "composed-provider-replaced"
        self.assertEqual(self.client.post("/api/action-invocations/", replaced, format="json").status_code, 422)
        self.backend_registry._record_actions[producer.id] = provider
        private_user = User.objects.create_user(username="private_record_owner", password="pass")
        private_project = Project.objects.create(name="Private Record Project")
        Grant.objects.create(project=private_project, user=private_user, role=ProjectRole.EDIT)
        private_record = create_record(
            actor=private_user, project=private_project, schema=self.schema,
            name="Private sample", field_values={"field-concentration": {"type": "number", "value": 987654.0}},
            request_id=uuid4(),
        )
        unauthorized_target = self.client.post("/api/records/", self.create_payload(name="Unauthorized source"), format="json")
        unauthorized_sequence = deepcopy(sequence_declaration)
        unauthorized_sequence["steps"][0]["inputs"]["measurement"]["reference"] = {
            "mode": "current", "entityId": private_record["id"], "fieldId": "field-concentration",
        }
        unauthorized_document = save_revision_group(
            actor=self.user, record_id=unauthorized_target.data["id"], group_key="document",
            state_token=unauthorized_target.data["state_token"], request_id=uuid4(),
            snapshot={"document": {"type": "doc", "content": [{"type": "registry-table", "attrs": {
                "id": "registry-composed", "schemaId": self.schema.pk,
                "columns": [{"id": "field-concentration", "name": "Concentration", "type": "number"}],
                "rows": rows, "actionSequence": unauthorized_sequence,
            }}]}},
            target_model_reference="eln.entry", target_object_id="entry-unauthorized",
        )
        unauthorized_invocation = deepcopy(invocation)
        unauthorized_invocation.update({
            "invocationId": "composed-unauthorized-record-input",
            "sequenceDeclaration": unauthorized_sequence,
            "targets": {"record": unauthorized_target.data["id"]},
            "expectedState": {"record": {
                "stateToken": unauthorized_document["state_token"],
                "revisionId": unauthorized_target.data["revision"]["id"],
                "schemaState": unauthorized_target.data["schema_state"],
                "documentGroupId": unauthorized_document["group_id"],
                "documentRevisionId": unauthorized_document["revision_id"],
            }},
        })
        before_record_count = PlatformRecord.objects.count()
        denied = self.client.post("/api/action-invocations/", unauthorized_invocation, format="json")
        self.assertEqual(denied.status_code, 403, getattr(denied, "data", None))
        self.assertNotIn("987654", str(denied.data))
        self.assertEqual(PlatformRecord.objects.count(), before_record_count)
        self.assertEqual(producer_calls, [])
        unsupported_sequence = deepcopy(sequence_declaration)
        unsupported_sequence["steps"][0]["inputs"]["check"] = {"kind": "remote", "url": "https://invalid.test/value"}
        unsupported_document = save_revision_group(
            actor=self.user, record_id=unauthorized_target.data["id"], group_key="document",
            state_token=unauthorized_document["state_token"], request_id=uuid4(),
            snapshot={"document": {"type": "doc", "content": [{"type": "registry-table", "attrs": {
                "id": "registry-composed", "schemaId": self.schema.pk,
                "columns": [{"id": "field-concentration", "name": "Concentration", "type": "number"}],
                "rows": rows, "actionSequence": unsupported_sequence,
            }}]}},
            target_model_reference="eln.entry", target_object_id="entry-unauthorized",
        )
        unsupported_invocation = deepcopy(unauthorized_invocation)
        unsupported_invocation.update({
            "invocationId": "composed-unsupported-input-source",
            "sequenceDeclaration": unsupported_sequence,
            "expectedState": {"record": {
                "stateToken": unsupported_document["state_token"],
                "revisionId": unauthorized_target.data["revision"]["id"],
                "schemaState": unauthorized_target.data["schema_state"],
                "documentGroupId": unsupported_document["group_id"],
                "documentRevisionId": unsupported_document["revision_id"],
            }},
        })
        unsupported = self.client.post("/api/action-invocations/", unsupported_invocation, format="json")
        self.assertEqual(unsupported.status_code, 422, getattr(unsupported, "data", None))
        self.assertEqual(producer_calls, [])
        before_actions = ActionLogEntry.objects.count()
        result = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(result.status_code, 200, getattr(result, "data", None))
        self.assertEqual(producer_calls, ["produce"])
        self.assertEqual(producer_measurements, [1.25])
        self.assertEqual(ActionLogEntry.objects.count(), before_actions + 1)
        created = PlatformRecord.objects.get(pk=result.data["created"]["#new-composed"])
        saved_row = PlatformRecord.objects.get(pk=source.data["id"]).revision_groups.get(group_key="document").current_revision.snapshot["document"]["content"][0]["attrs"]["rows"][0]
        self.assertEqual(saved_row["recordId"], str(created.pk))
        self.assertEqual(result.data["stepOutputs"]["register"]["created"]["value"]["#new-composed"], str(created.pk))
        self.assertEqual(len(result.data["providers"]), 2)
        self.assertEqual(ActionParticipant.objects.filter(action_id=result.data["actionId"]).count(), 3)
        used = ActionParticipant.objects.get(action_id=result.data["actionId"], role="used", target_model_reference="helix.record")
        self.assertEqual(used.target_object_id, source.data["id"])
        self.assertEqual(result.data["participants"][1]["revisionId"], source.data["revision"]["id"])
        self.assertEqual(result.data["participants"][2]["after"]["sequence"], 1)
        replay = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(replay.status_code, 200, getattr(replay, "data", None))
        self.assertTrue(replay.data["replayed"])
        self.assertEqual(replay.data["created"], result.data["created"])
        self.assertEqual(producer_calls, ["produce"])

    def test_composed_action_sequence_rolls_back_earlier_producer_effects_on_later_failure(self):
        source = self.client.post("/api/records/", self.create_payload(name="Composed rollback"), format="json")
        rows = [{
            "displayId": "#new-failure", "entityId": None, "__name": "Failure sample",
            "values": {"Concentration": 2.0}, "isRegistered": False,
        }]
        sequence_declaration = {
            "fingerprint": "fixture.atomic-produce-register.v1",
            "steps": [
                {"id": "produce", "action": {"kind": "action", "id": "fixture.science.atomic-producer", "version": "1.0.0"},
                 "inputs": {}, "parameters": {}, "targets": {"record": "record"}},
                {"id": "register", "action": {"kind": "action", "id": "helix.lims.registry-register", "version": "1.0.0"},
                 "inputs": {"rows": {"kind": "step", "stepId": "produce", "port": "rows"}},
                 "parameters": {
                     "schemaId": {"type": {"type": "number"}, "value": self.schema.pk},
                     "fieldMapping": {"type": {"type": "json"}, "value": {"field-concentration": "missing-field"}},
                     "blockId": {"type": {"type": "string"}, "value": "registry-failure"},
                 }, "targets": {"record": "record"}},
            ],
        }
        document_group = save_revision_group(
            actor=self.user, record_id=source.data["id"], group_key="document",
            state_token=source.data["state_token"], request_id=uuid4(),
            snapshot={"document": {"type": "doc", "content": [{"type": "registry-table", "attrs": {
                "id": "registry-failure", "schemaId": self.schema.pk,
                "columns": [{"id": "field-concentration", "name": "Concentration", "type": "number"}],
                "rows": rows, "actionSequence": sequence_declaration,
            }}]}},
            target_model_reference="eln.entry", target_object_id="entry-failure",
        )
        producer_contract = {
            "formatVersion": 1, "kind": "action", "id": "fixture.science.atomic-producer",
            "version": "1.0.0", "description": "Propose one record and saved rows",
            "definition": {
                "inputs": {}, "parameters": {},
                "outputs": {"rows": {"type": "json"}},
                "targets": {"record": "helix.record"},
                "effects": {"record": "edited", "records": "created"},
            },
        }
        RetainedContract.objects.create(
            kind="action", contract_id=producer_contract["id"], version="1.0.0",
            fingerprint=contract_fingerprint(producer_contract),
            canonical_envelope=canonical_json(producer_contract).decode("utf-8"),
        )
        registrar = ModRegistrar(ModManifest(
            id="fixture.science", display_name="Fixture Science", version="1.0.0",
            requires_helix=">=1.0.0", artifacts=("backend",), depends_on=(),
        ), self.backend_registry)
        def propose_earlier_record(_context, _inputs):
            return ProposedEffects(
                creates=[{"key": "producer-record", "name": "Must roll back", "schema_id": self.schema.pk,
                          "field_values": {"field-concentration": {"type": "number", "value": 99.0}}}],
                outputs={"rows": {"type": "json", "value": rows}},
            )
        producer = registrar.register_record_action(
            "atomic-producer", label="Atomic producer",
            action_contract_id=producer_contract["id"], action_contract_version="1.0.0",
            handler=propose_earlier_record,
        )
        from bundled.lims.actions import ACTION_CONTRACT_ID, ACTION_CONTRACT_VERSION, propose_registry_registration
        registration = registrar.register_record_action(
            "atomic-register", label="Atomic registration",
            action_contract_id=ACTION_CONTRACT_ID, action_contract_version=ACTION_CONTRACT_VERSION,
            handler=propose_registry_registration,
        )
        invocation = {
            "invocationId": "composed-register-fail", "sequenceFingerprint": "fixture.atomic-produce-register.v1",
            "sequenceDeclaration": sequence_declaration,
            "inputs": {}, "parameters": {}, "targets": {"record": source.data["id"]},
            "expectedState": {"record": {
                "stateToken": document_group["state_token"], "revisionId": source.data["revision"]["id"],
                "schemaState": source.data["schema_state"], "documentGroupId": document_group["group_id"],
                "documentRevisionId": document_group["revision_id"],
            }},
            "providers": {"steps": {"produce": producer.id, "register": registration.id}},
            "steps": [
                {"id": "produce", "inputs": {}, "parameters": {}},
                {"id": "register", "inputs": {"rows": {"kind": "step", "stepId": "produce", "port": "rows"}},
                 "parameters": {
                     "schemaId": self.schema.pk,
                     "fieldMapping": {"field-concentration": "missing-field"},
                     "blockId": "registry-failure",
                 }},
            ],
        }
        before_actions = ActionLogEntry.objects.count()
        before_revisions = ScientificRevision.objects.count()
        result = self.client.post("/api/action-invocations/", invocation, format="json")
        self.assertEqual(result.status_code, 422, getattr(result, "data", None))
        self.assertEqual(PlatformRecord.objects.count(), 1)
        self.assertEqual(ScientificRevision.objects.count(), before_revisions)
        self.assertEqual(ActionLogEntry.objects.count(), before_actions)

    def test_independently_committed_producer_survives_later_registration_failure(self):
        source = self.client.post("/api/records/", self.create_payload(name="Independent producer"), format="json")
        rows = [{"displayId": "#independent", "entityId": None, "__name": "Independent sample",
                 "values": {"Concentration": 3.0}, "isRegistered": False}]
        document_group = save_revision_group(
            actor=self.user, record_id=source.data["id"], group_key="document",
            state_token=source.data["state_token"], request_id=uuid4(),
            snapshot={"document": {"type": "doc", "content": [{"type": "registry-table", "attrs": {
                "id": "registry-independent", "schemaId": self.schema.pk,
                "columns": [{"id": "field-concentration", "name": "Concentration", "type": "number"}],
                "rows": rows,
            }}]}},
            target_model_reference="eln.entry", target_object_id="entry-independent",
        )
        producer_contract = {
            "formatVersion": 1, "kind": "action", "id": "fixture.science.independent-producer",
            "version": "1.0.0", "description": "Commit a record before registration",
            "definition": {"inputs": {}, "parameters": {}, "outputs": {},
                           "targets": {"record": "helix.record"},
                           "effects": {"record": "edited", "records": "created"}},
        }
        RetainedContract.objects.create(
            kind="action", contract_id=producer_contract["id"], version="1.0.0",
            fingerprint=contract_fingerprint(producer_contract),
            canonical_envelope=canonical_json(producer_contract).decode("utf-8"),
        )
        registrar = ModRegistrar(ModManifest(
            id="fixture.science", display_name="Fixture Science", version="1.0.0",
            requires_helix=">=1.0.0", artifacts=("backend",), depends_on=(),
        ), self.backend_registry)
        producer = registrar.register_record_action(
            "independent-producer", label="Independent producer",
            action_contract_id=producer_contract["id"], action_contract_version="1.0.0",
            handler=lambda _context, _inputs: ProposedEffects(creates=[{
                "key": "independent-record", "name": "Independently committed",
                "schema_id": self.schema.pk,
                "field_values": {"field-concentration": {"type": "number", "value": 8.0}},
            }]),
        )
        producer_invocation = {
            "invocationId": "independent-producer-commit", "sequenceFingerprint": "legacy-single-action",
            "inputs": {}, "parameters": {}, "targets": {"record": source.data["id"]},
            "expectedState": {"record": {"stateToken": document_group["state_token"]}},
            "providers": {"action": producer.id},
        }
        committed = self.client.post("/api/action-invocations/", producer_invocation, format="json")
        self.assertEqual(committed.status_code, 200, getattr(committed, "data", None))
        created_id = next(iter(committed.data["created"].values()))

        from bundled.lims.actions import ACTION_CONTRACT_ID, ACTION_CONTRACT_VERSION, propose_registry_registration
        registration = registrar.register_record_action(
            "independent-register", label="Invalid registration",
            action_contract_id=ACTION_CONTRACT_ID, action_contract_version=ACTION_CONTRACT_VERSION,
            handler=propose_registry_registration,
        )
        failed = self.client.post("/api/action-invocations/", {
            "invocationId": "independent-registration-failure", "sequenceFingerprint": "legacy-single-action",
            "inputs": {"rows": rows}, "parameters": {
                "schemaId": self.schema.pk,
                "fieldMapping": {"field-concentration": "missing-field"},
                "blockId": "registry-independent",
            }, "targets": {"record": source.data["id"]},
            "expectedState": {"record": {
                "stateToken": document_group["state_token"], "revisionId": source.data["revision"]["id"],
                "schemaState": source.data["schema_state"],
                "documentGroupId": document_group["group_id"],
                "documentRevisionId": document_group["revision_id"],
            }}, "providers": {"action": registration.id},
        }, format="json")
        self.assertEqual(failed.status_code, 422, getattr(failed, "data", None))
        self.assertTrue(PlatformRecord.objects.filter(pk=created_id).exists())

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
