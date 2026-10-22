"""Independent-connection cleanup/link acceptance for PostgreSQL deployments."""

import copy
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest import skipUnless

from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.utils import timezone

from bundled.access.access.models import Grant, ProjectRole
from helix_core.attachments import cleanup_staged_attachments, link_revision_attachments, upload_attachment
from helix_core.core.models import Project, User
from helix_core.models import PlatformAttachment, RecordRevisionGroup, Schema, SchemaType, ScientificRevision
from helix_core.record_persistence import _digest, create_record


@skipUnless(connection.vendor == "postgresql", "Requires independent PostgreSQL row locks.")
class AttachmentCleanupLinkRaceTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.storage_path = tempfile.mkdtemp(prefix="helix-attachment-race-")
        from unittest.mock import patch
        self.storage_patch = patch("helix_core.attachments.default_storage", FileSystemStorage(location=self.storage_path))
        self.storage_patch.start()
        self.actor = User.objects.create_user(username="attachment_race", password="pass")
        self.project = Project.objects.create(name="Attachment race")
        Grant.objects.create(project=self.project, user=self.actor, role=ProjectRole.EDIT)
        self.schema_type = SchemaType.objects.create(
            display_name="Attachment", workspace_id="fixture.attachment", model="platform.record",
            columns=[{"id": "file", "name": "File", "type": "attachmentReference"}],
        )
        self.schema = Schema.objects.create(name="Attachment", prefix="ATT", schema_type=self.schema_type)

    def tearDown(self):
        self.storage_patch.stop()
        import shutil
        shutil.rmtree(self.storage_path, ignore_errors=True)
        super().tearDown()

    def test_cleanup_cannot_remove_bytes_that_a_concurrent_revision_links(self):
        staged = upload_attachment(
            project=self.project, actor=self.actor,
            uploaded_file=SimpleUploadedFile("race.txt", b"immutable", content_type="text/plain"),
        )
        PlatformAttachment.objects.filter(pk=staged.pk).update(created_at=timezone.now() - timedelta(days=2))
        created = create_record(actor=self.actor, project=self.project, schema=self.schema, name="Race", field_values={})
        group = RecordRevisionGroup.objects.get(record_id=created["id"], group_key="record")
        barrier = Barrier(2)

        def link_revision():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                with transaction.atomic():
                    locked_group = RecordRevisionGroup.objects.select_for_update().get(pk=group.pk)
                    previous = locked_group.current_revision
                    snapshot = copy.deepcopy(previous.snapshot)
                    snapshot["field_values"] = {"file": {"type": "attachmentReference", "value": {"id": str(staged.pk)}}}
                    revision = ScientificRevision.objects.create(
                        group=locked_group, sequence=locked_group.revisions.count() + 1,
                        snapshot=snapshot, content_hash=_digest(snapshot), created_by=self.actor,
                    )
                    link_revision_attachments(project_id=self.project.pk, values=snapshot, revision=revision)
                    locked_group.current_revision = revision
                    locked_group.save(update_fields=["current_revision"])
                return "linked"
            except Exception as exc:
                from rest_framework.exceptions import ValidationError
                if isinstance(exc, ValidationError):
                    return "cleanup_won"
                raise
            finally:
                close_old_connections()

        def cleanup():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return cleanup_staged_attachments()
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            link_future = pool.submit(link_revision)
            cleanup_future = pool.submit(cleanup)
            link_outcome = link_future.result(timeout=20)
            cleanup_future.result(timeout=20)

        group.refresh_from_db()
        attachment_exists = PlatformAttachment.objects.filter(pk=staged.pk).exists()
        if link_outcome == "linked":
            self.assertTrue(attachment_exists)
            self.assertTrue(group.current_revision.attachment_links.filter(attachment_id=staged.pk).exists())
            from helix_core.attachments import default_storage
            with default_storage.open(staged.storage_key, "rb") as content:
                self.assertEqual(content.read(), b"immutable")
        else:
            self.assertFalse(attachment_exists)
            self.assertEqual(group.current_revision.sequence, 1)
