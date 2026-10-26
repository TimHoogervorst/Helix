"""Immutable Platform attachment storage, linking, download and cleanup."""

from __future__ import annotations

import hashlib
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError


DEFAULT_MAX_BYTES = 100 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024


class AttachmentTooLarge(APIException):
    status_code = 413
    default_detail = "The uploaded file exceeds the configured size limit."
    default_code = "upload_too_large"


class AttachmentIntegrityFailure(APIException):
    status_code = 500
    default_detail = "Stored attachment content failed its integrity check."
    default_code = "attachment_integrity_error"


def _verify_content(storage_key, expected_size, expected_digest):
    try:
        content = default_storage.open(storage_key, "rb")
        digest = hashlib.sha256()
        size = 0
        with content:
            for chunk in iter(lambda: content.read(CHUNK_SIZE), b""):
                size += len(chunk)
                digest.update(chunk)
    except (OSError, FileNotFoundError) as exc:
        raise AttachmentIntegrityFailure("Stored attachment content is unavailable.") from exc
    if size != expected_size or digest.hexdigest() != expected_digest:
        raise AttachmentIntegrityFailure()


def _attachment_ids(value):
    """Find declared attachment references inside stored typed values."""
    if isinstance(value, dict):
        if value.get("type") == "attachmentReference":
            ref = value.get("value")
            if isinstance(ref, dict) and isinstance(ref.get("id"), str):
                yield ref["id"]
        for child in value.values():
            yield from _attachment_ids(child)
    elif isinstance(value, list):
        for child in value:
            yield from _attachment_ids(child)


def upload_attachment(*, project, actor, uploaded_file):
    from helix_core.models import PlatformAttachment

    limit = min(DEFAULT_MAX_BYTES, int(getattr(settings, "PLATFORM_ATTACHMENT_MAX_BYTES", DEFAULT_MAX_BYTES)))
    digest = hashlib.sha256()
    size = 0
    storage_key = f"platform-attachments/{uuid.uuid4().hex}"

    try:
        for chunk in uploaded_file.chunks(CHUNK_SIZE):
            size += len(chunk)
            if size > limit:
                raise AttachmentTooLarge({"file": f"File exceeds the {limit}-byte upload limit."})
            digest.update(chunk)
        if getattr(uploaded_file, "size", size) != size:
            raise ValidationError({"file": "Uploaded stream length does not match the declared length."})
        uploaded_file.seek(0)
        saved_key = default_storage.save(storage_key, uploaded_file)
        _verify_content(saved_key, size, digest.hexdigest())
        row = PlatformAttachment.objects.create(
            project=project,
            created_by=actor,
            storage_key=saved_key,
            filename=(uploaded_file.name or "attachment").replace("\\", "/").rsplit("/", 1)[-1][:255],
            media_type=(getattr(uploaded_file, "content_type", None) or "application/octet-stream")[:255],
            size=size,
            sha256=digest.hexdigest(),
            status="staged",
        )
        return row
    except Exception:
        if "saved_key" in locals():
            default_storage.delete(saved_key)
        raise


def link_revision_attachments(*, project_id, values, revision):
    """Lock, validate, and retain every attachment referenced by a snapshot."""
    from helix_core.models import AttachmentRevisionLink, PlatformAttachment

    ids = sorted(set(_attachment_ids(values)))
    if not ids:
        return []
    with transaction.atomic():
        rows = list(PlatformAttachment.objects.select_for_update().filter(pk__in=ids).order_by("pk"))
        by_id = {str(row.pk): row for row in rows}
        missing = [attachment_id for attachment_id in ids if attachment_id not in by_id]
        if missing:
            raise ValidationError({"field_values": f"Unknown attachment reference: {missing[0]}"})
        for row in rows:
            if row.project_id != project_id:
                raise ValidationError({"field_values": "Attachment belongs to a different Project."})
            if row.status not in {"staged", "complete"}:
                raise ValidationError({"field_values": "Attachment is not finalized."})
            if not default_storage.exists(row.storage_key):
                raise ValidationError({"field_values": f"Attachment bytes are unavailable for {row.pk}."})
            _verify_content(row.storage_key, row.size, row.sha256)
            AttachmentRevisionLink.objects.get_or_create(revision=revision, attachment=row)
            if row.status == "staged":
                row.status = "complete"
            row.unreferenced_at = None
            row.save(update_fields=["status", "unreferenced_at"])
        return rows


def cleanup_staged_attachments(*, now=None, age=timedelta(hours=24)):
    """Delete aged unreferenced stages under the same row lock used by linking."""
    from helix_core.models import PlatformAttachment

    cutoff = (now or timezone.now()) - age
    removed = 0
    candidates = PlatformAttachment.objects.filter(
        status="staged", created_at__lt=cutoff,
    ).values_list("pk", flat=True)
    released = PlatformAttachment.objects.filter(
        status="complete", unreferenced_at__lt=cutoff,
    ).values_list("pk", flat=True)
    for candidate_id in (candidates.union(released)).iterator():
        with transaction.atomic():
            row = PlatformAttachment.objects.select_for_update().filter(pk=candidate_id).first()
            if row is None or row.revision_links.exists():
                continue
            aged = row.created_at < cutoff if row.status == "staged" else (row.unreferenced_at is not None and row.unreferenced_at < cutoff)
            if not aged:
                continue
            default_storage.delete(row.storage_key)
            row.delete()
            removed += 1
    return removed


def attachment_metadata(snapshot, *, record_id=None, revision_id=None):
    from helix_core.models import PlatformAttachment

    ids = sorted(set(_attachment_ids(snapshot)))
    rows = PlatformAttachment.objects.filter(pk__in=ids)
    by_id = {str(row.pk): row for row in rows}
    result = []
    for attachment_id in ids:
        row = by_id.get(attachment_id)
        if row is None:
            continue
        item = {
            "id": str(row.pk), "filename": row.filename, "mediaType": row.media_type,
            "size": row.size, "sha256": row.sha256,
        }
        if record_id is not None and revision_id is not None:
            item["downloadUrl"] = f"/api/records/{record_id}/attachments/{row.pk}/content/?revision_id={revision_id}"
        result.append(item)
    return result


def rendition_metadata(*, record_id, revision_id=None):
    """List Platform-retained presentation artifacts for an exact Revision."""
    from helix_core.models import PlatformRendition

    return [{
        "id": str(row.pk), "record_id": str(row.record_id),
        "group_id": str(row.group_id), "revision_id": str(row.revision_id),
        "revision_sequence": row.revision.sequence,
        "source_hash": row.source_hash,
        "captured_by": row.captured_by_snapshot or None,
        "captured_at": row.captured_at.isoformat(),
        "presentation_provider": row.presentation_provider,
        "presentation_version": row.presentation_version,
        "presentation_context": row.presentation_context,
        "attachment_id": str(row.attachment_id),
        "filename": row.attachment.filename,
        "media_type": row.attachment.media_type,
        "size": row.attachment.size,
        "rendition_hash": row.attachment.sha256,
        "download_url": f"/api/records/{record_id}/attachments/{row.attachment_id}/content/?revision_id={row.revision_id}",
        "kind": "historical_rendition",
    } for row in PlatformRendition.objects.select_related("attachment", "revision").filter(
        record_id=record_id,
        **({"revision_id": revision_id} if revision_id is not None else {}),
    ).order_by("captured_at", "pk")]


def open_revision_attachment(*, record, revision_id, attachment_id, actor):
    from bundled.access.access.policies import effective_role
    from helix_core.models import AttachmentRevisionLink, ScientificRevision

    if effective_role(actor, record) not in {"read", "review", "edit"}:
        raise PermissionDenied("You do not have permission to read this record.")
    try:
        revision = ScientificRevision.objects.get(
            pk=revision_id,
            group__record=record,
            attachment_links__attachment_id=attachment_id,
        )
        link = AttachmentRevisionLink.objects.select_related("attachment").get(
            revision=revision, attachment_id=attachment_id,
        )
    except (ScientificRevision.DoesNotExist, AttachmentRevisionLink.DoesNotExist, ValueError):
        raise NotFound("Attachment is not retained by this record Revision.")
    row = link.attachment
    if row.project_id != record.project_id:
        raise NotFound("Attachment not found.")
    _verify_content(row.storage_key, row.size, row.sha256)
    try:
        return row, default_storage.open(row.storage_key, "rb")
    except (OSError, FileNotFoundError) as exc:
        raise AttachmentIntegrityFailure("Stored attachment content is unavailable.") from exc

