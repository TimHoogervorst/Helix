"""Persisted, non-blocking Platform discussions."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bundled.access.access.policies import effective_role
from helix_core.models import (
    PlatformDiscussion,
    PlatformDiscussionMessage,
    PlatformDiscussionMessageRevision,
    PlatformRecord,
)


def _role(user, record):
    role = effective_role(user, record)
    if role is None:
        raise NotFound("Discussion not found.")
    return role


def _require_review(role):
    if role not in {"review", "edit"}:
        raise PermissionDenied("Review access is required to contribute to discussions.")


def _message_payload(message, actor, can_contribute):
    history = list(message.history.all())
    latest = history[-1] if history else None
    return {
        "id": str(message.pk),
        "parent_id": str(message.parent_id) if message.parent_id else None,
        "author": message.author_snapshot,
        "created_at": message.created_at,
        "body": latest.body if latest and latest.action != "retract" else "",
        "retracted": bool(latest and latest.action == "retract"),
        "can_change": can_contribute and message.author_id == actor.pk and not (latest and latest.action == "retract"),
        "history": [{
            "action": item.action,
            "body": item.body,
            "actor": item.actor_snapshot,
            "created_at": item.created_at,
        } for item in history],
    }


def _discussion_payload(discussion, actor, role):
    can_contribute = role in {"review", "edit"}
    return {
        "id": str(discussion.pk),
        "origin_id": str(discussion.origin_id),
        "record_id": str(discussion.record_id),
        "created_by": discussion.created_by_snapshot,
        "created_at": discussion.created_at,
        "resolved": discussion.is_resolved,
        "resolved_by": discussion.resolved_by_snapshot,
        "resolved_at": discussion.resolved_at,
        "can_contribute": can_contribute and not discussion.is_resolved,
        "can_resolve": role == "edit" or discussion.created_by_id == actor.pk,
        "messages": [_message_payload(message, actor, can_contribute) for message in discussion.messages.prefetch_related("history")],
    }


def _clean_body(value):
    if not isinstance(value, str) or not value.strip():
        raise ValidationError({"body": "Message text is required."})
    if len(value) > 20000:
        raise ValidationError({"body": "Message text must be 20,000 characters or fewer."})
    return value.strip()


def _create_message(discussion, actor, body, parent=None):
    message = PlatformDiscussionMessage.objects.create(
        discussion=discussion, parent=parent, author=actor,
    )
    PlatformDiscussionMessageRevision.objects.create(
        message=message, sequence=1, action="create", body=body, actor=actor,
    )
    return message


class PlatformDiscussionCollectionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        record_id = request.query_params.get("record")
        if not record_id:
            raise ValidationError({"record": "A Platform record ID is required."})
        record = get_object_or_404(PlatformRecord.objects.select_related("project"), pk=record_id)
        _role(request.user, record)
        discussions = PlatformDiscussion.objects.filter(record=record).select_related(
            "record", "created_by", "resolved_by",
        ).prefetch_related("messages__history").order_by("-created_at", "id")
        role = _role(request.user, record)
        return Response({
            "results": [_discussion_payload(item, request.user, role) for item in discussions],
            "can_contribute": role in {"review", "edit"},
        })

    @transaction.atomic
    def post(self, request):
        record_id = request.data.get("record_id")
        if not record_id:
            raise ValidationError({"record_id": "A Platform record ID is required."})
        record = get_object_or_404(PlatformRecord.objects.select_related("project"), pk=record_id)
        role = _role(request.user, record)
        _require_review(role)
        body = _clean_body(request.data.get("body"))
        discussion = PlatformDiscussion.objects.create(record=record, created_by=request.user)
        _create_message(discussion, request.user, body)
        return Response(_discussion_payload(discussion, request.user, role), status=status.HTTP_201_CREATED)


class PlatformDiscussionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _discussion(self, request, discussion_id):
        discussion = get_object_or_404(
            PlatformDiscussion.objects.select_related("record__project", "created_by", "resolved_by"),
            pk=discussion_id,
        )
        role = _role(request.user, discussion.record)
        return discussion, role

    def get(self, request, discussion_id):
        discussion, _ = self._discussion(request, discussion_id)
        return Response(_discussion_payload(discussion, request.user, _))

    @transaction.atomic
    def post(self, request, discussion_id):
        discussion, role = self._discussion(request, discussion_id)
        _require_review(role)
        if discussion.is_resolved:
            raise ValidationError("Resolved discussions cannot receive replies.")
        body = _clean_body(request.data.get("body"))
        parent_id = request.data.get("parent_id")
        parent = None
        if parent_id:
            parent = get_object_or_404(PlatformDiscussionMessage, pk=parent_id, discussion=discussion)
        _create_message(discussion, request.user, body, parent=parent)
        return Response(_discussion_payload(discussion, request.user, role), status=status.HTTP_201_CREATED)


class PlatformDiscussionResolveView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, discussion_id):
        discussion = get_object_or_404(
            PlatformDiscussion.objects.select_for_update().select_related("record__project"),
            pk=discussion_id,
        )
        role = _role(request.user, discussion.record)
        if role != "edit" and discussion.created_by_id != request.user.pk:
            raise PermissionDenied("Only the discussion opener or an editor can resolve it.")
        if not discussion.is_resolved:
            discussion.resolved_at = timezone.now()
            discussion.resolved_by = request.user
            discussion.save(update_fields=("resolved_at", "resolved_by", "resolved_by_snapshot"))
        return Response(_discussion_payload(discussion, request.user, role))


class PlatformDiscussionMessageView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, discussion_id, message_id):
        return self._change(request, discussion_id, message_id, "amend")

    @transaction.atomic
    def delete(self, request, discussion_id, message_id):
        return self._change(request, discussion_id, message_id, "retract")

    def _change(self, request, discussion_id, message_id, action):
        message = get_object_or_404(
            PlatformDiscussionMessage.objects.select_for_update().select_related(
                "discussion__record__project", "author",
            ).prefetch_related("history"),
            pk=message_id, discussion_id=discussion_id,
        )
        role = _role(request.user, message.discussion.record)
        _require_review(role)
        if message.author_id != request.user.pk:
            raise PermissionDenied("You can only amend or retract your own messages.")
        previous = message.history.order_by("-sequence").first()
        if previous and previous.action == "retract":
            raise ValidationError("A retracted message cannot be changed again.")
        body = _clean_body(request.data.get("body")) if action == "amend" else ""
        PlatformDiscussionMessageRevision.objects.create(
            message=message,
            sequence=(previous.sequence if previous else 0) + 1,
            action=action,
            body=body,
            actor=request.user,
        )
        return Response(_discussion_payload(message.discussion, request.user, role))
