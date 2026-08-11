import logging
import uuid

import django.db.models
from django.db import IntegrityError

from django.utils.dateparse import parse_datetime
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.response import Response

from helix_core.actions.logger import bulk_log_actions, log_action
from helix_core.actions.mixins import ActionLoggingMixin, logs_action

from mods.tags.models import Tag

from helix_core.models import Schema

from .models import NotebookEntry, ContentVersion, ElnAction, EntryLock, Protocol
from .serializers import (
    NotebookEntrySerializer,
    NotebookEntryCreateSerializer,
    ElnActionSerializer,
    ElnActionBatchSerializer,
    ElnActionCreateSerializer,
    ProtocolSerializer,
)
from .sync import sync_entry_content

eln_logger = logging.getLogger(__name__)


DEFAULT_SAVE_MODE = "manual"


class LockedException(APIException):
    """HTTP 423 Locked — raised when another user holds the entry lock."""

    status_code = 423
    default_detail = "This entry is currently being edited by another user."
    default_code = "locked"


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

    queryset = NotebookEntry.objects.select_related("author", "folder").prefetch_related(
        "mentions"
    )
    serializer_class = NotebookEntrySerializer
    lookup_field = "display_id"

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
        from helix_core.models import SchemaType

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

    def perform_create(self, serializer):
        author = self.request.user if self.request.user.is_authenticated else None
        schema = self._get_default_schema()
        folder = serializer.validated_data["folder"]
        instance = serializer.save(author=author, schema=schema, project=folder.project)
        sync_entry_content(instance)
        self._maybe_log("create", instance=instance, validated_data=serializer.validated_data)

    def perform_update(self, serializer):
        """Save an entry update with content versioning and hash-based no-op.

        Flow:
        0. Check lock — reject 423 if another user holds a non-stale lock.
        1. Validate same-project move — reject cross-Project folder changes.
        2. Hash incoming content, compare with latest ContentVersion.
           If hash matches AND no other fields changed → return early (no-op).
        3. Save the entry via the serializer.
        4. Run the sync pipeline.
        5. Create a ContentVersion only if content actually changed.
        6. Log an "edited" action with version metadata (if content changed).
        """
        instance = serializer.instance
        validated_data = serializer.validated_data
        content = validated_data.get("content")

        # ── Lock enforcement ───────────────────────────────────────────────
        lock: EntryLock | None = None
        try:
            lock = instance.lock  # OneToOneField reverse accessor
        except EntryLock.DoesNotExist:
            pass

        if lock is not None and not lock.is_stale() and lock.held_by != self.request.user:
            raise LockedException()

        # ── Cross-Project move rejection ───────────────────────────────────
        if "folder" in validated_data:
            new_folder = validated_data["folder"]
            if new_folder.project_id != instance.project_id:
                from rest_framework.exceptions import ValidationError
                raise ValidationError(
                    {"folder": "Entries cannot be moved to a different Project."}
                )

        # Determine save_mode from request header.
        valid_modes = {choice[0] for choice in ContentVersion.SAVE_MODE_CHOICES}
        save_mode = self.request.headers.get("X-Save-Mode", DEFAULT_SAVE_MODE)
        if save_mode not in valid_modes:
            save_mode = DEFAULT_SAVE_MODE

        # ── Determine whether content actually changed ──────────────────
        content_changed = False
        if content is not None:
            incoming_hash = ContentVersion.hash_content(content)
            latest_version = ContentVersion.latest_for(instance)
            if latest_version is None:
                content_changed = True
            elif latest_version.content_hash != incoming_hash:
                content_changed = True
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
        # Capture pre-save content for fingerprint comparison.
        # serializer.instance is the DB object before save() mutates it.
        old_content = serializer.instance.content
        instance = serializer.save()
        sync_entry_content(instance, old_content=old_content)

        # ── Create ContentVersion (content changes only) ────────────────
        version_metadata: dict = {}
        if content_changed:
            version_number = ContentVersion.next_version_number(instance)
            cv = ContentVersion.objects.create(
                entry=instance,
                content=instance.content,
                content_hash=ContentVersion.hash_content(instance.content),
                version_number=version_number,
                created_by=self.request.user,
                save_mode=save_mode,
            )
            version_metadata = {
                "version_id": cv.id,
                "version_number": version_number,
                "save_mode": save_mode,
            }

        # ── Log action (delegated to ActionLoggingMixin) ────────────────
        # Suppress eln.entry.edited when the frontend signals that block-level
        # actions exist for this save cycle (X-Block-Actions header). Block
        # actions are the canonical audit record for content changes.
        instance._version_metadata = version_metadata
        if not self.request.headers.get("X-Block-Actions"):
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
        count, _ = NotebookEntry.objects.all().delete()
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
        qs = ElnAction.objects.filter(
            target_type="eln.entry",
            target_id=entry.id,
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

        Returns:
            201 — first-time lock acquired.
            200 — existing lock refreshed (same user re-acquires).
            201 — stale lock stolen (deletes old, creates new).
            423 — another user holds an active lock.
        """
        entry = self.get_object()

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

        Always returns 204 so the frontend cleanup function can call this
        unconditionally without triggering the API client's 403→/login
        redirect when the user doesn't hold the lock.

        Returns:
            204 — lock released, didn't exist, or held by another user.
        """
        entry = self.get_object()

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

        Returns 200 with:
            locked: bool
            held_by: int | None  (user id)
            acquired_at: str | None  (ISO 8601)
            last_activity_at: str | None  (ISO 8601)
        """
        entry = self.get_object()

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
    permission_classes = []

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
