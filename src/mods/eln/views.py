import logging
import uuid

import django.db.models
from django.db import IntegrityError
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError

from django.utils.dateparse import parse_datetime
from django.http import Http404
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError as DRFValidationError
from rest_framework.response import Response

from helix_core.public import bulk_log_actions, log_action
from helix_core.public import VersionTarget
from helix_core.public import ActionLoggingMixin, logs_action
from helix_core.public import delete_source_descendants

from helix_core.public import Tag
from helix_core.public import IsOrganizationAdmin, IsOrganizationAdminForWrites
from helix_core.public import visible_rows_q

from helix_core.public import ActionLogEntry, Schema

from .models import NotebookEntry, EntryLock, HistoricalRendition, Protocol
from .config import CONTENT_VERSION_REFERENCE, ENTRY_MODEL_REFERENCE
from .serializers import (
    NotebookEntrySerializer,
    NotebookEntryCreateSerializer,
    ElnActionSerializer,
    ElnActionBatchSerializer,
    ElnActionCreateSerializer,
    ProtocolSerializer,
)
from .sync import sync_entry_content
from .renditions import (
    PRESENTATION_PROVIDER, PRESENTATION_VERSION, embedded_resource_count,
    render_document_pdf,
)

eln_logger = logging.getLogger(__name__)


class LockedException(APIException):
    """HTTP 423 Locked — raised when another user holds the entry lock."""

    status_code = 423
    default_detail = "This entry is currently being edited by another user."
    default_code = "locked"


class ReviewCaptureUnavailable(APIException):
    status_code = 503
    default_detail = "The ELN review rendition could not be captured."
    default_code = "rendition_capture_failed"


class NotebookEntryViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    """
    API endpoint for ELN notebook entries.

    list: GET /api/eln/entries/ — list all entries (paginated)
    create: POST /api/eln/entries/ — create a new entry
    retrieve: GET /api/eln/entries/{display_id}/ — lookup by display_id
    update: PUT /api/eln/entries/{display_id}/ — update entry
    partial_update: PATCH /api/eln/entries/{display_id}/ — partial update
    destroy: DELETE /api/eln/entries/{display_id}/ — delete entry
    delete_all: DELETE /api/eln/entries/delete_all/ — delete all entries
    attach_tags: POST /api/eln/entries/{display_id}/tags/ — attach one or more tags
    detach_tag: DELETE /api/eln/entries/{display_id}/tags/{tag_id}/ — detach a tag
    lock_status: GET /api/eln/entries/{display_id}/lock/ — lock status
    acquire_lock: POST /api/eln/entries/{display_id}/lock/ — acquire or refresh lock
    release_lock: DELETE /api/eln/entries/{display_id}/lock/ — release lock
    """

    queryset = NotebookEntry.objects.select_related("author", "project").prefetch_related(
        "mentions"
    )
    serializer_class = NotebookEntrySerializer
    lookup_field = "display_id"

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action in ("list", "retrieve") or (
            self.request.method == "GET"
            and self.action in ("entry_actions", "lock")
        ):
            queryset = queryset.filter(visible_rows_q(self.request.user))
        return queryset

    def get_permissions(self):
        if self.action == "delete_all":
            return [IsOrganizationAdmin()]
        return super().get_permissions()

    _entry_edited_config = {
        "action": "eln.entry.edited",
        # _version_metadata is set as a transient attr in perform_update
        # before _maybe_log fires.  The lambda reads it back so version
        # metadata flows from the save pipeline into the action log without
        # duplicating the computation.
        "get_metadata": lambda instance, validated_data, request: getattr(
            instance, "_version_metadata", {}
        ),
    }

    action_log_config = {
        "create": {"action": "eln.entry.created"},
        "update": _entry_edited_config,
        "partial_update": _entry_edited_config,
        "destroy": {"action": "eln.entry.deleted"},
    }

    def get_serializer_class(self):
        if self.action == "create":
            return NotebookEntryCreateSerializer
        return NotebookEntrySerializer

    @staticmethod
    def _get_default_schema():
        """Return the default Schema for ELN notebook entries.

        Uses ``get_or_create`` so the endpoint is resilient to the Schema
        not having been created yet — e.g. after a fresh migration where
        the mod registration hasn't run.
        """
        from helix_core.public import SchemaType

        schema_type, _ = SchemaType.objects.get_or_create(
            model="mods.eln.models.NotebookEntry",
            defaults={
                "display_name": "ELN Entry",
                "workspace_id": "eln",
            },
        )
        schema, _ = Schema.objects.get_or_create(
            schema_type=schema_type,
            is_default=True,
            defaults={
                "name": "Default",
                "prefix": "E",
            },
        )
        return schema

    @staticmethod
    def _create_document_record(entry, actor, request_id=None):
        """Create the Platform record and its initial portable document Revision."""
        from helix_core.public import create_record, save_revision_group

        record = create_record(
            actor=actor,
            project=entry.project,
            schema=entry.schema,
            name=entry.name,
            field_values={},
            request_id=request_id or uuid.uuid4(),
        )
        saved = save_revision_group(
            actor=actor,
            record_id=record["id"],
            group_key="document",
            state_token=record["state_token"],
            request_id=uuid.uuid4(),
            snapshot={
                "contract": {"kind": "data", "id": "helix.eln.document", "version": "1.0.0"},
                "document": entry.content,
            },
            target_model_reference="eln.entry",
            target_object_id=str(entry.pk),
            action_type="created",
        )
        entry.platform_record_id = record["id"]
        entry.save(update_fields=["platform_record"])
        return saved

    @staticmethod
    def _save_entry_document(entry, actor, document, *, state_token, request_id, name=None):
        from helix_core.public import save_revision_group

        group = entry.platform_record.revision_groups.filter(
            group_key="document"
        ).select_related("current_revision").first()
        if document is None and group and group.current_revision:
            snapshot = group.current_revision.snapshot
        else:
            snapshot = {
                "contract": {"kind": "data", "id": "helix.eln.document", "version": "1.0.0"},
                "document": document,
            }
        return save_revision_group(
            actor=actor,
            record_id=entry.platform_record_id,
            group_key="document",
            state_token=state_token,
            request_id=request_id or uuid.uuid4(),
            snapshot=snapshot,
            target_model_reference="eln.entry",
            target_object_id=str(entry.pk),
            action_type="edited",
            record_name=name,
        )

    @transaction.atomic
    def perform_create(self, serializer):
        from helix_core.public import effective_role, role
        from rest_framework.exceptions import PermissionDenied

        project = serializer.validated_data["project"]
        source_type = serializer.validated_data.get("source_type")
        source = (
            NotebookEntry.resolve_source(
                source_type,
                serializer.validated_data.get("source_id"),
            ) if source_type is not None else project
        )
        permission = effective_role(self.request.user, source) if source_type is not None else role(
            self.request.user, project,
        )
        if permission != "edit":
            raise PermissionDenied(
                "You do not have permission to create entries in this Project."
            )
        author = self.request.user if self.request.user.is_authenticated else None
        schema = self._get_default_schema()
        request_id = serializer.validated_data.pop("request_id", None)
        instance = serializer.save(author=author, schema=schema, project=project)
        sync_entry_content(instance)
        document_result = self._create_document_record(
            instance,
            actor=self.request.user,
            request_id=request_id,
        )
        instance._document_save_metadata = document_result

    def _can_edit_entry(self, instance):
        """Check whether request.user can edit *instance*.

        Returns ``True`` when the user has Edit access — direct, Team-derived,
        Organization Admin override, or a Read + Write share evaluated via the
        target Project.
        """
        from helix_core.public import effective_role

        return effective_role(self.request.user, instance) == "edit"

    def perform_destroy(self, instance):
        if not self._can_edit_entry(instance):
            raise PermissionDenied(
                "You do not have permission to delete this entry."
            )
        if instance.platform_record_id:
            from helix_core.public import ensure_record_unlocked
            ensure_record_unlocked(instance.platform_record_id)
        with transaction.atomic():
            delete_source_descendants(instance, actor=self.request.user)
            if instance.platform_record_id:
                from helix_core.public import delete_platform_record

                delete_platform_record(
                    instance.platform_record,
                    actor=self.request.user,
                    source={
                        "kind": "eln-entry",
                        "type": ENTRY_MODEL_REFERENCE,
                        "id": str(instance.pk),
                    },
                )
            super().perform_destroy(instance)

    @action(detail=True, methods=["post"], url_path="review")
    def review(self, request, display_id=None):
        """Capture and retain a self-contained PDF for the selected saved Revision."""
        from helix_core.public import effective_role
        from helix_core.public import link_revision_attachments, upload_attachment
        from helix_core.public import (
            PlatformAttachment, PlatformRecord, ScientificRevision,
        )
        from helix_core.public import (
            StateConflict, lock_record_revision_for_update,
        )

        entry = self.get_object()
        if effective_role(request.user, entry) != "edit":
            raise PermissionDenied("You do not have permission to review this entry.")
        record = entry.platform_record
        if record is None:
            raise StateConflict("Save the document before reviewing it.")

        state_token = request.data.get("state_token")
        revision_id = request.data.get("revision_id")
        if not state_token or not revision_id:
            raise DRFValidationError({"review": "state_token and revision_id are required."})
        group = record.revision_groups.filter(group_key="document").select_related(
            "current_revision"
        ).first()
        revision = group.current_revision if group else None
        if (
            revision is None
            or str(revision.pk) != str(revision_id)
            or str(record.state_token) != str(state_token)
        ):
            raise StateConflict("Review requires the exact current saved document Revision.")
        if not isinstance(revision.snapshot, dict) or revision.snapshot.get("document") != entry.content:
            raise StateConflict("The ELN document and its current Platform Revision disagree.")

        source_snapshot = revision.snapshot
        source_hash = revision.content_hash
        captured_at = timezone.now()
        try:
            pdf_bytes = render_document_pdf(
                entry_name=entry.name,
                revision_snapshot=source_snapshot,
                project_id=record.project_id,
            )
            pdf_upload = ContentFile(
                pdf_bytes,
                name=f"{entry.display_id}-revision-{revision.sequence}-review.pdf",
            )
            pdf_upload.content_type = "application/pdf"
            uploaded = upload_attachment(
                project=record.project,
                actor=request.user,
                uploaded_file=pdf_upload,
            )
        except Exception as exc:
            if isinstance(exc, (DRFValidationError, PermissionDenied, StateConflict)):
                raise
            eln_logger.exception("Failed to render ELN review rendition")
            raise ReviewCaptureUnavailable() from exc

        try:
            with transaction.atomic():
                locked_record, locked_group = lock_record_revision_for_update(
                    actor=request.user,
                    record_id=record.pk,
                    group_key="document",
                    state_token=state_token,
                    revision_id=revision.pk,
                )
                locked_entry = NotebookEntry.objects.select_for_update().get(pk=entry.pk)
                active_lock = EntryLock.objects.select_for_update().filter(entry=locked_entry).first()
                if active_lock and not active_lock.is_stale() and active_lock.held_by_id != request.user.pk:
                    raise LockedException()
                if effective_role(request.user, locked_record) != "edit":
                    raise PermissionDenied("You do not have permission to review this entry.")
                if (
                    str(locked_group.pk) != str(group.pk)
                    or str(locked_record.state_token) != str(state_token)
                    or str(locked_group.current_revision_id) != str(revision.pk)
                ):
                    raise StateConflict("The document changed while its review rendition was being captured.")
                locked_revision = ScientificRevision.objects.get(
                    pk=revision.pk, group=locked_group,
                )
                if (
                    locked_revision.content_hash != source_hash
                    or locked_revision.snapshot != source_snapshot
                    or locked_entry.platform_record_id != locked_record.pk
                ):
                    raise StateConflict("The document changed while its review rendition was being captured.")

                link_revision_attachments(
                    project_id=locked_record.project_id,
                    values={"type": "attachmentReference", "value": {"id": str(uploaded.pk)}},
                    revision=locked_revision,
                )
                presentation_context = {
                    "format": "pdf",
                    "renderingMode": "saved-document-generic",
                    "embeddedSource": "source-document.json",
                    "embeddedResourceCount": embedded_resource_count(source_snapshot),
                }
                from helix_core.public import VersionTarget, log_action, retain_rendition

                rendition = retain_rendition(
                    record_id=locked_record.pk,
                    group_id=locked_group.pk,
                    revision_id=locked_revision.pk,
                    attachment_id=uploaded.pk,
                    source_hash=source_hash,
                    actor=request.user,
                    captured_at=captured_at,
                    presentation_provider=PRESENTATION_PROVIDER,
                    presentation_version=PRESENTATION_VERSION,
                    presentation_context=presentation_context,
                )

                log_action(
                    user=request.user,
                    action="eln.entry.reviewed",
                    target_type="eln.entry",
                    target_id=locked_entry.pk,
                    action_type="reviewed",
                    request_id=uuid.uuid4(),
                    version_target=VersionTarget(
                        reference="helix.record.revision",
                        object_id=str(locked_revision.pk),
                        label=str(locked_revision.sequence),
                        content_hash=source_hash,
                    ),
                    metadata={
                        "record_id": str(locked_record.pk),
                        "group_id": str(locked_group.pk),
                        "group_key": "document",
                        "revision_id": str(locked_revision.pk),
                        "source_hash": source_hash,
                        "rendition_id": str(rendition.pk),
                        "attachment_id": str(uploaded.pk),
                        "captured_at": captured_at.isoformat(),
                        "presentation_provider": PRESENTATION_PROVIDER,
                        "presentation_version": PRESENTATION_VERSION,
                    },
                )
            return Response({
                "id": str(rendition.pk),
                "revision_id": str(revision.pk),
                "source_hash": source_hash,
                "attachment_id": str(uploaded.pk),
                "download_url": f"/api/records/{record.pk}/attachments/{uploaded.pk}/content/?revision_id={revision.pk}",
                "captured_at": captured_at.isoformat(),
                "presentation_provider": PRESENTATION_PROVIDER,
                "presentation_version": PRESENTATION_VERSION,
                "presentation_context": presentation_context,
            }, status=status.HTTP_201_CREATED)
        except Exception:
            # Database rollback leaves the attachment as an unreferenced stage.
            # Remove both staged bytes and the stage row, so no dangling file
            # remains after a failed review or audit write.
            default_storage.delete(uploaded.storage_key)
            PlatformAttachment.objects.filter(pk=uploaded.pk, status="staged").delete()
            raise

    @action(detail=True, methods=["post"], url_path="review/submit")
    def submit_review(self, request, display_id=None):
        """Submit the exact saved ELN state through Platform's review contract."""
        from helix_core.public import submit_review_target
        from helix_core.public import effective_role
        from helix_core.public import StateConflict

        entry = self.get_object()
        if effective_role(request.user, entry) != "edit":
            raise PermissionDenied("You do not have permission to submit this entry for review.")
        record = entry.platform_record
        if record is None:
            raise StateConflict("Save the document before submitting it for review.")
        state_token = request.data.get("state_token")
        revision_id = request.data.get("revision_id")
        if not state_token or not revision_id:
            raise DRFValidationError({"review": "state_token and revision_id are required."})
        group = record.revision_groups.filter(group_key="document").select_related("current_revision").first()
        if (
            group is None or group.current_revision_id is None
            or str(group.current_revision_id) != str(revision_id)
            or str(record.state_token) != str(state_token)
            or group.current_revision.snapshot.get("document") != entry.content
        ):
            raise StateConflict("Submission requires the exact current saved ELN document Revision.")
        result = submit_review_target(
            record_id=record.pk,
            target_identity="helix.eln:review-target",
            actor=request.user,
            expected_state_token=state_token,
            expected_groups={"document": str(revision_id)},
            request_id=request.data.get("request_id"),
        )
        result["download_url"] = (
            f"/api/records/{record.pk}/attachments/{result['attachment_id']}/content/"
            f"?revision_id={revision_id}"
        )
        return Response(result, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="review/withdraw")
    def withdraw_review(self, request, display_id=None):
        """Explicitly return the submitted entry to authoring, retaining its round."""
        from helix_core.public import withdraw_review_submission

        entry = self.get_object()
        if entry.platform_record_id is None:
            raise DRFValidationError({"review": "This entry has no Platform review target."})
        return Response(withdraw_review_submission(
            record_id=entry.platform_record_id,
            actor=request.user,
            request_id=request.data.get("request_id"),
        ))

    @action(detail=True, methods=["get"], url_path="review/status")
    def review_status(self, request, display_id=None):
        from helix_core.public import review_target_state, effective_role

        entry = self.get_object()
        if effective_role(request.user, entry) not in {"read", "edit"}:
            raise PermissionDenied("You do not have permission to read review history.")
        if entry.platform_record_id is None:
            return Response({"available": False, "reason": "Save the document before review."})
        return Response(review_target_state(record_id=entry.platform_record_id, actor=request.user))

    @action(detail=True, methods=["get"], url_path="renditions")
    def renditions(self, request, display_id=None):
        """List immutable captures while applying the entry's current access policy."""
        from helix_core.public import effective_role

        entry = self.get_object()
        if effective_role(request.user, entry) not in {"read", "review", "edit"}:
            raise PermissionDenied("You do not have permission to read this entry's history.")
        results = []
        from helix_core.public import list_renditions
        results = list_renditions(record_id=entry.platform_record_id)
        return Response({"results": results})

    @transaction.atomic
    def perform_update(self, serializer):
        """Save an entry update through the Platform Revision boundary.

        Flow:
        0. Check lock — reject 423 if another user holds a non-stale lock.
        1. Enforce access — reject 403 for Read viewers, cross-subtree moves.
        2. Validate same-project move — reject cross-Project folder changes.
        3. Compare incoming content with the current Platform document Revision.
           If hash matches AND no other fields changed → return early (no-op).
        4. Save the entry via the serializer.
        5. Run the sync pipeline.
        6. Save a new Platform document Revision only if content changed.
        7. Log an "edited" action with version metadata (if content changed).
        """
        instance = serializer.instance
        validated_data = serializer.validated_data
        content = validated_data.get("content")
        expected_state_token = validated_data.pop("state_token", None)
        request_id = validated_data.pop("request_id", None) or uuid.uuid4()

        # ── Lock enforcement ───────────────────────────────────────────────
        lock: EntryLock | None = None
        try:
            lock = instance.lock  # OneToOneField reverse accessor
        except EntryLock.DoesNotExist:
            pass

        if lock is not None and not lock.is_stale() and lock.held_by != self.request.user:
            raise LockedException()

        # ── Access enforcement ─────────────────────────────────────────────
        if not self._can_edit_entry(instance):
            raise PermissionDenied(
                "You do not have permission to edit this entry."
            )
        if instance.platform_record_id:
            from helix_core.public import ensure_record_unlocked
            ensure_record_unlocked(instance.platform_record_id)

        # ── Cross-Project move rejection ───────────────────────────────────
        if "source_type" in validated_data or "source_id" in validated_data:
            from helix_core.public import effective_role
            from helix_core.public import Project

            if validated_data.get("source_type") is None:
                from helix_core.public import Folder
                new_source = instance.project if validated_data.get("source_id") is None else Folder.objects.get(pk=validated_data["source_id"])
            else:
                new_source = instance.resolve_source(
                    validated_data["source_type"],
                    validated_data.get("source_id", instance.source_id),
                )
            new_source_project_id = getattr(new_source, "project_id", new_source.pk)
            if new_source_project_id != instance.project_id:
                raise DRFValidationError(
                    {"source": "Source must belong to the same Project."}
                )
            if not isinstance(new_source, Project) and effective_role(
                self.request.user, new_source
            ) != "edit":
                raise DRFValidationError(
                    {"source": "You do not have permission to move the entry here."}
                )
            instance.set_source(new_source)

        # Resolve the authoritative document from its Platform Revision Group.
        old_content = instance.content
        current_document = old_content
        if instance.platform_record_id:
            document_group = instance.platform_record.revision_groups.filter(
                group_key="document"
            ).select_related("current_revision").first()
            if document_group and document_group.current_revision:
                current_document = document_group.current_revision.snapshot.get(
                    "document", old_content
                )

        # ── Determine whether content actually changed ──────────────────
        content_changed = content is not None and content != current_document
            # else: hash matches → content unchanged

        # ── Hash-based no-op short-circuit ──────────────────────────────
        if content is not None and not content_changed:
            # Content unchanged — check whether any other field changed.
            other_fields_changed = False
            for field_name in validated_data:
                if field_name == "content":
                    continue
                new_value = validated_data[field_name]
                old_value = getattr(instance, field_name)
                # FK fields: compare pk to avoid ModelInstance != int.
                if isinstance(old_value, django.db.models.Model):
                    new_pk = new_value.pk if isinstance(new_value, django.db.models.Model) else new_value
                    if old_value.pk != new_pk:
                        other_fields_changed = True
                        break
                elif old_value != new_value:
                    other_fields_changed = True
                    break

            if not other_fields_changed:
                return  # true no-op — nothing changed

        # ── Save & sync ─────────────────────────────────────────────────
        document_result = None
        name_changed = validated_data.get("name", instance.name) != instance.name
        if instance.platform_record_id and (content_changed or name_changed):
            document_result = self._save_entry_document(
                instance,
                self.request.user,
                content if content_changed else None,
                state_token=expected_state_token or instance.platform_record.state_token,
                request_id=request_id,
                name=validated_data.get("name") if name_changed else None,
            )
        try:
            instance = serializer.save()
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.message_dict) from exc
        if document_result:
            instance.platform_record.refresh_from_db()
        if content_changed:
            sync_entry_content(instance, old_content=old_content)

        version_metadata = {
            "revision_id": document_result["revision_id"],
            "group_id": document_result["group_id"],
        } if document_result else {}

        # ── Log action (delegated to ActionLoggingMixin) ────────────────
        # Suppress eln.entry.edited when the frontend signals that block-level
        # actions exist for this save cycle (X-Block-Actions header). Block
        # actions are the canonical audit record for content changes.
        instance._version_metadata = version_metadata
        instance._document_save_metadata = version_metadata
        if not document_result:
            self._maybe_log(
                self.action,
                instance=instance,
                validated_data=validated_data,
            )

    def create(self, request, *args, **kwargs):
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)
        self.perform_create(write_serializer)
        read_serializer = NotebookEntrySerializer(write_serializer.instance)
        headers = self.get_success_headers(read_serializer.data)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=False, methods=["delete"], url_path="delete_all")
    def delete_all(self, request):
        """Delete ALL notebook entries. Danger zone endpoint for testing."""
        count = 0
        with transaction.atomic():
            for entry in list(NotebookEntry.objects.all()):
                if not NotebookEntry.objects.filter(pk=entry.pk).exists():
                    continue
                delete_source_descendants(entry, actor=request.user)
                if entry.platform_record_id:
                    from helix_core.public import delete_platform_record

                    delete_platform_record(
                        entry.platform_record,
                        actor=request.user,
                        source={
                            "kind": "eln-entry",
                            "type": ENTRY_MODEL_REFERENCE,
                            "id": str(entry.pk),
                        },
                    )
                entry.delete()
                count += 1
        return Response({"deleted": count})

    @logs_action(
        "eln.entry.tags_attached",
        get_metadata=lambda inst, data, req: {"tag_ids": req.data.get("tag_ids", [])},
    )
    @action(detail=True, methods=["post"], url_path="tags")
    def attach_tags(self, request, display_id=None):
        """Attach one or more tags to the entry.

        Body: {"tag_ids": [1, 2, 3]}
        """
        entry = self.get_object()
        if not self._can_edit_entry(entry):
            raise PermissionDenied(
                "You do not have permission to edit this entry."
            )
        if entry.platform_record_id:
            from helix_core.public import ensure_record_unlocked
            ensure_record_unlocked(entry.platform_record_id)
        tag_ids = request.data.get("tag_ids", [])
        if not isinstance(tag_ids, list):
            return Response(
                {"error": "tag_ids must be a list"}, status=status.HTTP_400_BAD_REQUEST
            )

        tags = Tag.objects.filter(id__in=tag_ids)
        entry.tags.add(*tags)
        read_serializer = NotebookEntrySerializer(entry)
        return Response(read_serializer.data)

    @logs_action(
        "eln.entry.tag_detached",
        get_metadata=lambda inst, data, req: {"tag_id": int(req.resolver_match.kwargs["tag_id"])},
    )
    @action(detail=True, methods=["delete"], url_path="tags/(?P<tag_id>[^/.]+)")
    def detach_tag(self, request, display_id=None, tag_id=None):
        """Detach a tag from the entry."""
        entry = self.get_object()
        if not self._can_edit_entry(entry):
            raise PermissionDenied(
                "You do not have permission to edit this entry."
            )
        if entry.platform_record_id:
            from helix_core.public import ensure_record_unlocked
            ensure_record_unlocked(entry.platform_record_id)
        try:
            tag = Tag.objects.get(id=tag_id)
        except Tag.DoesNotExist:
            return Response(
                {"error": "Tag not found"}, status=status.HTTP_404_NOT_FOUND
            )
        entry.tags.remove(tag)
        read_serializer = NotebookEntrySerializer(entry)
        return Response(read_serializer.data)

    @action(detail=True, methods=["get", "post"], url_path="actions")
    def entry_actions(self, request, display_id=None):
        """GET: list actions for an entry, filterable by ?action_type= and ?since=.

        POST: log a custom action against an entry.

        GET /api/eln/entries/{display_id}/actions/
        GET /api/eln/entries/{display_id}/actions/?action_type=edited
        GET /api/eln/entries/{display_id}/actions/?action_type=edited&since=2026-06-30T00:00:00Z

        POST /api/eln/entries/{display_id}/actions/
        Body: {"action": "eln.entry.custom_action", "action_type": "edited", "metadata": {"text": "..."}}
        """
        if request.method == "POST":
            return self._create_action(request, display_id)
        return self._list_actions(request, display_id)

    def _list_actions(self, request, display_id):
        entry = self.get_object()
        qs = ActionLogEntry.objects.filter(
            target_model_reference="eln.entry",
            target_object_id=str(entry.id),
        ).select_related("performed_by").order_by("-created_at")

        # Filter by action_type (e.g. "edited", "created")
        action_type = request.query_params.get("action_type")
        if action_type:
            qs = qs.filter(action_type=action_type)

        # Filter by since (ISO 8601 datetime)
        since_str = request.query_params.get("since")
        if since_str:
            since = parse_datetime(since_str)
            if since is None:
                return Response(
                    {"error": "Invalid since parameter. Use ISO 8601 format."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qs = qs.filter(created_at__gte=since)

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = ElnActionSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = ElnActionSerializer(qs, many=True)
        return Response(serializer.data)

    def _create_action(self, request, display_id):
        entry = self.get_object()
        serializer = ElnActionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = log_action(
            user=request.user,
            action=serializer.validated_data["action"],
            action_type=serializer.validated_data.get("action_type"),
            target_type="eln.entry",
            target_id=entry.id,
            metadata=serializer.validated_data.get("metadata") or {},
        )

        read_serializer = ElnActionSerializer(action)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="actions/batch")
    def entry_actions_batch(self, request, display_id=None):
        """POST /api/eln/entries/{display_id}/actions/batch/

        Accept a batched list of block-level action log entries.
        Creates all action rows in a single bulk insert per mod table.

        Body:
            {
                "actions": [
                    {"action": "eln.table.edited", "metadata": {...}},
                    {"action": "eln.comment.created", "metadata": {...}},
                ]
            }

        ``performed_by`` is derived from ``request.user``.
        ``target_type`` and ``target_id`` are derived from the route.
        All actions in the batch share a single ``request_id``.

        Returns 201 with ``{count, request_id}``.  Fail-open: logging
        failure never breaks the response.
        """
        entry = self.get_object()
        serializer = ElnActionBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        batch_request_id = uuid.uuid4()
        client_ip = request.META.get("REMOTE_ADDR", "")

        try:
            results = bulk_log_actions(
                user=request.user,
                actions=serializer.validated_data["actions"],
                target_type="eln.entry",
                target_id=entry.id,
                request_id=batch_request_id,
                client_ip=client_ip or None,
            )
            return Response(
                {"count": len(results), "request_id": str(batch_request_id)},
                status=status.HTTP_201_CREATED,
            )
        except Exception:
            eln_logger.exception(
                "Batch action logging failed for entry %s (display_id=%s)",
                entry.id,
                display_id,
            )
            # Fail-open: return success even if logging fails.
            return Response(
                {"count": 0, "request_id": str(batch_request_id)},
                status=status.HTTP_201_CREATED,
            )

    # ── Lock helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _lock_response(lock: EntryLock) -> dict:
        """Return the standard payload dict for an active lock."""
        return {
            "locked": True,
            "held_by": lock.held_by.id,
            "held_by_username": lock.held_by.username,
            "acquired_at": lock.acquired_at,
            "last_activity_at": lock.last_activity_at,
        }

    # ── Lock endpoint (GET / POST / DELETE) ──────────────────────────────
    #
    # A single @action handles all three HTTP methods because DRF's router
    # does not merge multiple @action decorators that share the same
    # url_path — only one would win, and the others would 405.

    @action(detail=True, methods=["get", "post", "delete"], url_path="lock")
    def lock(self, request, display_id=None):
        """GET    — return current lock status.
        POST   — acquire or refresh the lock.
        DELETE — release the lock.
        """
        if request.method == "GET":
            return self._lock_status(request, display_id)
        elif request.method == "POST":
            return self._acquire_lock(request, display_id)
        elif request.method == "DELETE":
            return self._release_lock(request, display_id)
        # DRF guarantees one of the three; fallback is defensive.
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    # ── Lock sub-actions ─────────────────────────────────────────────────

    def _acquire_lock(self, request, display_id=None):
        """Acquire or refresh the lock on this entry.

        Requires Edit access on the entry — acquiring a lock is a
        mutation that reserves the right to change content.

        Returns:
            201 — first-time lock acquired.
            200 — existing lock refreshed (same user re-acquires).
            201 — stale lock stolen (deletes old, creates new).
            423 — another user holds an active lock.
            403 — the requester cannot Edit this entry.
        """
        from helix_core.public import effective_role
        from rest_framework.exceptions import PermissionDenied

        entry = self.get_object()

        if effective_role(request.user, entry) != "edit":
            raise PermissionDenied(
                "You do not have permission to lock this entry."
            )
        if entry.platform_record_id:
            from helix_core.public import ensure_record_unlocked
            ensure_record_unlocked(entry.platform_record_id)

        try:
            existing = entry.lock
        except EntryLock.DoesNotExist:
            existing = None

        if existing is not None:
            if existing.held_by == request.user:
                # Same user re-acquiring — refresh last_activity_at.
                existing.save()  # auto_now=True bumps last_activity_at
                return Response(
                    self._lock_response(existing),
                    status=status.HTTP_200_OK,
                )
            elif existing.is_stale():
                # Stale lock — steal it.
                existing.delete()
            else:
                # Another user holds an active lock.
                return Response(
                    {
                        "locked": True,
                        "held_by": existing.held_by.id,
                        "held_by_username": existing.held_by.username,
                        "detail": "This entry is currently being edited by another user.",
                    },
                    status=423,
                )

        # Create a new lock.  Wrap in a try/except to handle the race where a
        # concurrent request inserts a lock between our check above and this
        # insert — e.g. the DELETE cleanup from a closing tab racing with the
        # POST acquire from the newly opened tab.
        try:
            lock = EntryLock.objects.create(entry=entry, held_by=request.user)
        except IntegrityError:
            # Re-fetch — the lock definitely exists now.  Use a direct query
            # instead of entry.lock because Django's ReverseOneToOneDescriptor
            # caches the negative lookup from the check above and would re-raise
            # EntryLock.DoesNotExist without re-querying the database.
            try:
                existing = EntryLock.objects.get(entry=entry)
            except EntryLock.DoesNotExist:
                # Lock was deleted between the IntegrityError and the re-fetch
                # (e.g. a release raced in).  Retry the create.
                lock = EntryLock.objects.create(
                    entry=entry, held_by=request.user,
                )
            else:
                if existing.held_by == request.user:
                    existing.save()
                    return Response(
                        self._lock_response(existing),
                        status=status.HTTP_200_OK,
                    )
                elif existing.is_stale():
                    existing.delete()
                    lock = EntryLock.objects.create(
                        entry=entry, held_by=request.user,
                    )
                else:
                    return Response(
                        {
                            "locked": True,
                            "held_by": existing.held_by.id,
                            "held_by_username": existing.held_by.username,
                            "detail": "This entry is currently being edited by another user.",
                        },
                        status=423,
                    )
        return Response(
            self._lock_response(lock),
            status=status.HTTP_201_CREATED,
        )

    def _release_lock(self, request, display_id=None):
        """Release the lock on this entry (idempotent).

        Requires Edit access on the entry — releasing a lock is a
        mutation that requires the same right as acquiring one.

        Returns:
            204 — lock released, didn't exist, or held by another user.
            403 — the requester cannot Edit this entry.
        """
        from helix_core.public import effective_role
        from rest_framework.exceptions import PermissionDenied

        entry = self.get_object()

        if effective_role(request.user, entry) != "edit":
            raise PermissionDenied(
                "You do not have permission to release the lock on this entry."
            )

        try:
            existing = entry.lock
        except EntryLock.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Only delete if we own the lock; otherwise it's a no-op.
        if existing.held_by == request.user:
            existing.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)

    def _lock_status(self, request, display_id=None):
        """Return the current lock status for this entry.

        Requires Read access on the entry — lock status is a read.  A
        viewer without Read access gets a 404 indistinguishable from a
        missing entry.

        Returns 200 with:
            locked: bool
            held_by: int | None  (user id)
            acquired_at: str | None  (ISO 8601)
            last_activity_at: str | None  (ISO 8601)
        """
        from helix_core.public import effective_role

        entry = self.get_object()

        if effective_role(request.user, entry) is None:
            raise Http404("No entry matches the given query.")

        try:
            existing = entry.lock
        except EntryLock.DoesNotExist:
            return Response({"locked": False})

        return Response(self._lock_response(existing))


class ProtocolViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    """
    API endpoint for ELN protocol definitions.

    list: GET /api/eln/protocols/ — list active protocols
    create: POST /api/eln/protocols/ — create a protocol
    retrieve: GET /api/eln/protocols/{id}/ — retrieve a protocol
    update: PUT /api/eln/protocols/{id}/ — full update
    partial_update: PATCH /api/eln/protocols/{id}/ — partial update
    destroy: DELETE /api/eln/protocols/{id}/ — soft-delete (sets is_active=False)
    """

    queryset = Protocol.objects.all()
    serializer_class = ProtocolSerializer
    permission_classes = [IsOrganizationAdminForWrites]

    action_log_config = {
        "create": {"action": "eln.protocol.created"},
        "update": {"action": "eln.protocol.edited"},
        "partial_update": {"action": "eln.protocol.edited"},
        "destroy": {"action": "eln.protocol.deleted"},
    }

    def get_queryset(self):
        """Filter to active protocols by default.

        Pass ?is_active=false to include inactive (soft-deleted) protocols,
        or ?is_active=all to return everything.
        """
        qs = super().get_queryset()
        is_active_param = self.request.query_params.get("is_active", "true")

        if is_active_param == "all":
            return qs
        if is_active_param == "false":
            return qs.filter(is_active=False)
        return qs.filter(is_active=True)

    def perform_destroy(self, instance):
        """Soft-delete: set is_active=False instead of removing the row."""
        instance._pre_delete_pk = instance.pk
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        self._maybe_log("destroy", instance=instance)
