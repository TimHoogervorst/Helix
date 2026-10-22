"""ELN review capture persists a rendition for one exact document Revision."""

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import uuid4
from datetime import timedelta

from django.contrib.contenttypes.models import ContentType
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import override_settings
from django.utils import timezone
from pypdf import PdfReader

from .support import BaseTestCase
from helix_core.public import User
from helix_core.public import upload_attachment
from helix_core.public import ActionLogEntry, AttachmentRevisionLink, PlatformAttachment
from mods.eln.models import HistoricalRendition, NotebookEntry

from .factories import TEXT_DOC


@override_settings(ROOT_URLCONF="mods.eln.tests.urls")
class ReviewRenditionApiTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.storage_dir = TemporaryDirectory()
        self.storage_override = override_settings(MEDIA_ROOT=self.storage_dir.name)
        self.storage_override.enable()

    def tearDown(self):
        self.storage_override.disable()
        self.storage_dir.cleanup()
        super().tearDown()

    def create_entry(self):
        response = self.client.post(
            "/api/eln/entries/",
            {
                "name": "Reviewable document",
                "content": TEXT_DOC,
                "source_type": ContentType.objects.get_for_model(self.folder).pk,
                "source_id": self.folder.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data, NotebookEntry.objects.get(pk=response.data["id"])

    def capture(self, entry_data):
        return self.client.post(
            f"/api/eln/entries/{entry_data['display_id']}/review/",
            {
                "state_token": entry_data["platform_state_token"],
                "revision_id": entry_data["document_revision_id"],
            },
            format="json",
        )

    def test_review_stages_real_pdf_and_retains_it_on_exact_document_revision(self):
        entry_data, entry = self.create_entry()
        source_file = ContentFile(b"embedded source material", name="sample.txt")
        source_file.content_type = "text/plain"
        resource = upload_attachment(
            project=self.project,
            actor=self.user,
            uploaded_file=source_file,
        )
        document = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Reviewable document"}]},
                {"type": "image", "attrs": {
                    "attachment": {"type": "attachmentReference", "value": {"id": str(resource.pk)}}
                }},
            ],
        }
        saved = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {
                "name": entry.name,
                "content": document,
                "state_token": entry_data["platform_state_token"],
                "request_id": str(uuid4()),
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        entry_data = saved.data

        response = self.capture(entry_data)

        self.assertEqual(response.status_code, 201, response.data)
        rendition = HistoricalRendition.objects.get(entry=entry)
        revision = entry.platform_record.revision_groups.get(
            group_key="document"
        ).current_revision
        self.assertEqual(rendition.revision_id, revision.pk)
        self.assertEqual(rendition.source_hash, revision.content_hash)
        self.assertEqual(rendition.captured_by, self.user)
        self.assertEqual(rendition.presentation_provider, "helix.eln.pdf")
        self.assertTrue(AttachmentRevisionLink.objects.filter(
            revision=revision, attachment=rendition.attachment,
        ).exists())
        self.assertEqual(rendition.attachment.status, "complete")

        with default_storage.open(rendition.attachment.storage_key, "rb") as pdf:
            reader = PdfReader(pdf)
            self.assertEqual(len(reader.pages), 1)
            self.assertIn("Reviewable document", reader.pages[0].extract_text())
            self.assertIn("source-document.json", reader.attachments)
            self.assertIn("sample.txt", reader.attachments)
            self.assertEqual(reader.attachments["sample.txt"][0], b"embedded source material")
        self.assertTrue(rendition.attachment.sha256)
        self.assertTrue(ActionLogEntry.objects.filter(
            action="eln.entry.reviewed",
            target_object_id=str(entry.pk),
            metadata__revision_id=str(revision.pk),
        ).exists())

        download = self.client.get(
            f"/api/records/{entry.platform_record_id}/attachments/{rendition.attachment_id}/content/",
            {"revision_id": revision.pk},
        )
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download["Content-Type"], "application/pdf")
        content = b"".join(download.streaming_content)
        download.close()
        self.assertTrue(content.startswith(b"%PDF-"))

        newer = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Later revision"}]}],
        }
        saved = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {
                "name": entry.name,
                "content": newer,
                "state_token": entry_data["platform_state_token"],
                "request_id": str(uuid4()),
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        historical_download = self.client.get(
            f"/api/records/{entry.platform_record_id}/attachments/{rendition.attachment_id}/content/",
            {"revision_id": revision.pk},
        )
        self.assertEqual(historical_download.status_code, 200)
        historical_download.close()

    def test_source_change_during_render_rejects_capture_and_cleans_staged_pdf(self):
        entry_data, entry = self.create_entry()
        from mods.eln.renditions import render_document_pdf as real_render

        def render_then_save(**kwargs):
            pdf = real_render(**kwargs)
            changed = {
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Concurrent edit"}]}],
            }
            saved = self.client.put(
                f"/api/eln/entries/{entry.display_id}/",
                {
                    "name": entry.name,
                    "content": changed,
                    "state_token": entry_data["platform_state_token"],
                    "request_id": str(uuid4()),
                },
                format="json",
            )
            self.assertEqual(saved.status_code, 200, saved.data)
            return pdf

        with patch("mods.eln.views.render_document_pdf", side_effect=render_then_save):
            response = self.capture(entry_data)

        self.assertEqual(response.status_code, 409, response.data)
        self.assertFalse(HistoricalRendition.objects.filter(entry=entry).exists())
        self.assertFalse(PlatformAttachment.objects.exists())
        self.assertFalse(ActionLogEntry.objects.filter(action="eln.entry.reviewed").exists())

    def test_changed_document_revision_rejects_capture_without_review_or_file(self):
        entry_data, entry = self.create_entry()
        newer = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Changed while reviewer was viewing"}]}],
        }
        saved = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {
                "name": entry.name,
                "content": newer,
                "state_token": entry_data["platform_state_token"],
                "request_id": str(uuid4()),
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        before = set(Path(self.storage_dir.name).rglob("*"))

        response = self.capture(entry_data)

        self.assertEqual(response.status_code, 409, response.data)
        self.assertFalse(HistoricalRendition.objects.filter(entry=entry).exists())
        after = set(Path(self.storage_dir.name).rglob("*"))
        self.assertEqual(after, before)

    def test_render_failure_does_not_commit_review_state_or_attachment(self):
        entry_data, entry = self.create_entry()
        with patch("mods.eln.views.render_document_pdf", side_effect=RuntimeError("renderer unavailable")):
            response = self.capture(entry_data)

        self.assertEqual(response.status_code, 503)
        self.assertFalse(HistoricalRendition.objects.filter(entry=entry).exists())
        self.assertFalse(PlatformAttachment.objects.exists())
        self.assertFalse(ActionLogEntry.objects.filter(action="eln.entry.reviewed").exists())

    def test_audit_failure_rolls_back_review_and_removes_staged_pdf(self):
        entry_data, entry = self.create_entry()
        self.client.raise_request_exception = False
        with patch("helix_core.actions.logger.log_action", side_effect=RuntimeError("audit unavailable")):
            response = self.capture(entry_data)

        self.assertEqual(response.status_code, 500)
        self.assertFalse(HistoricalRendition.objects.filter(entry=entry).exists())
        self.assertFalse(PlatformAttachment.objects.exists())
        self.assertFalse(AttachmentRevisionLink.objects.exists())

    def test_review_requires_edit_permission(self):
        entry_data, entry = self.create_entry()
        reader = User.objects.create_user(username="reader", password="testpass123")
        self.client.force_authenticate(user=reader)

        response = self.capture(entry_data)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(HistoricalRendition.objects.filter(entry=entry).exists())
        self.assertFalse(PlatformAttachment.objects.exists())

    def test_deleting_entry_removes_retained_rendition_and_platform_file(self):
        entry_data, entry = self.create_entry()
        response = self.capture(entry_data)
        self.assertEqual(response.status_code, 201, response.data)
        rendition_id = response.data["id"]
        attachment_id = response.data["attachment_id"]

        deleted = self.client.delete(f"/api/eln/entries/{entry.display_id}/")

        self.assertEqual(deleted.status_code, 204, getattr(deleted, "data", None))
        self.assertFalse(HistoricalRendition.objects.filter(pk=rendition_id).exists())
        attachment = PlatformAttachment.objects.get(pk=attachment_id)
        self.assertFalse(attachment.revision_links.exists())
        self.assertIsNotNone(attachment.unreferenced_at)
        from helix_core.public import cleanup_staged_attachments

        cleanup_staged_attachments(now=timezone.now() + timedelta(days=2))
        self.assertFalse(PlatformAttachment.objects.filter(pk=attachment_id).exists())
