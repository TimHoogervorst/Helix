"""Platform API operations for exact-submission review participation and blockers."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from bundled.access.access.policies import effective_role
from helix_core.models import (
    PlatformDiscussion, PlatformRecord, ReviewParticipation, ReviewSubmission,
    ReviewTarget, ReviewThread, ReviewThreadMessage, ReviewThreadMessageRevision,
    user_attribution_snapshot,
)


def _record_for_entry(entry, actor):
    if entry.platform_record_id is None:
        raise ValidationError({"review": "Save the document before review."})
    record = PlatformRecord.objects.select_related("project").get(pk=entry.platform_record_id)
    role = effective_role(actor, record)
    if role not in {"read", "review", "edit"}:
        raise NotFound("Review not found.")
    return record, role


def _payload(thread, actor, role):
    messages = []
    for message in thread.messages.prefetch_related("history", "author"):
        history = list(message.history.all())
        latest = history[-1] if history else None
        messages.append({
            "id": str(message.pk), "parent_id": str(message.parent_id) if message.parent_id else None,
            "author": message.author_snapshot, "body": latest.body if latest and latest.action != "retract" else "",
            "retracted": bool(latest and latest.action == "retract"),
            "can_change": role in {"review", "edit"} and message.author_id == actor.pk and not (latest and latest.action == "retract"),
            "history": [{"action": item.action, "body": item.body, "actor": item.actor_snapshot, "created_at": item.created_at} for item in history],
        })
    original = thread
    while original.carried_from_id:
        original = original.carried_from
    return {
        "id": str(thread.pk), "submission_id": str(thread.submission_id),
        "original_submission_id": str(original.submission_id),
        "carried_from_id": str(thread.carried_from_id) if thread.carried_from_id else None,
        "requester": thread.requester_snapshot, "anchor": thread.anchor, "state": thread.state,
        "requester_is_actor": thread.requester_id == actor.pk,
        "blocking": thread.state in {ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED},
        "raised_from_discussion_id": str(thread.raised_from_discussion.origin_id) if thread.raised_from_discussion_id else None,
        "created_at": thread.created_at, "resolved_at": thread.resolved_at,
        "can_resolve": role in {"review", "edit"} and thread.requester_id == actor.pk and thread.state in {ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED},
        "can_address": role in {"review", "edit"} and thread.requester_id != actor.pk and thread.state == ReviewThread.State.OPEN,
        "messages": messages,
    }


def review_threads(entry, actor):
    record, role = _record_for_entry(entry, actor)
    target = ReviewTarget.objects.filter(record=record).select_related("current_submission").first()
    if target is None:
        return {"participation": None, "threads": []}
    submission = target.current_submission or target.submissions.order_by("-round_number").first()
    if submission is None:
        return {"participation": None, "threads": []}
    participation = ReviewParticipation.objects.filter(submission=submission, actor=actor).first() if target.current_submission_id else None
    return {
        "participation": None if participation is None else {
            "id": str(participation.pk), "submission_id": str(submission.pk), "state": participation.state,
            "assessment": participation.assessment, "assessment_history": participation.assessment_history,
            "started_at": participation.started_at,
        },
        "threads": [_payload(t, actor, role) for t in ReviewThread.objects.filter(target=target).select_related("submission", "carried_from", "raised_from_discussion").prefetch_related("messages__history")],
    }


@transaction.atomic
def start_participation(entry, actor):
    record, role = _record_for_entry(entry, actor)
    if role not in {"review", "edit"}:
        raise PermissionDenied("Review access is required to participate.")
    target = ReviewTarget.objects.select_for_update().filter(record=record).first()
    if target is None or target.state != ReviewTarget.State.SUBMITTED or target.current_submission_id is None:
        raise ValidationError({"review": "There is no active submission to review."})
    participation, created = ReviewParticipation.objects.get_or_create(
        submission=target.current_submission, actor=actor, actor_stable_id=str(actor.pk),
        defaults={"actor_snapshot": user_attribution_snapshot(actor)},
    )
    return {"id": str(participation.pk), "submission_id": str(participation.submission_id), "state": participation.state, "created": created}


@transaction.atomic
def create_review_thread(entry, actor, *, submission_id, anchor, body, discussion_id=None):
    record, role = _record_for_entry(entry, actor)
    if role not in {"review", "edit"}:
        raise PermissionDenied("Review access is required to add feedback.")
    target = ReviewTarget.objects.select_for_update().select_related("current_submission").filter(record=record).first()
    if target is None or target.state != ReviewTarget.State.SUBMITTED or str(target.current_submission_id) != str(submission_id):
        raise ValidationError({"submission_id": "Feedback must be bound to the exact active submission."})
    if not ReviewParticipation.objects.filter(submission=target.current_submission, actor=actor).exists():
        raise PermissionDenied("Start review participation before adding feedback.")
    if not isinstance(anchor, dict) or anchor.get("submission_id") != str(target.current_submission_id):
        raise ValidationError({"anchor": "The anchor must identify the active submission."})
    group_key = anchor.get("group_key")
    revision = target.current_submission.manifest.get("groups", {}).get(group_key, {})
    if not revision or str(revision.get("revision_id")) != str(anchor.get("revision_id")):
        raise ValidationError({"anchor": "The anchor Revision does not belong to this submission."})
    provider = __import__("helix_core.mod_system.registry", fromlist=["registry"]).registry.get_review_target(target.registration_id)
    if provider is None or provider.anchor_validator is None:
        raise ValidationError({"anchor": "The registered Mod cannot validate review anchors."})
    try:
        valid = provider.anchor_validator(anchor=anchor, manifest=target.current_submission.manifest)
    except Exception as exc:
        raise ValidationError({"anchor": f"The Mod rejected the review anchor: {exc}"}) from exc
    if not valid:
        raise ValidationError({"anchor": "The selected content does not match the submitted Revision."})
    discussion = None
    if discussion_id:
        discussion = get_object_or_404(PlatformDiscussion, record=record, origin_id=discussion_id)
    thread = ReviewThread.objects.create(
        target=target, submission=target.current_submission, requester=actor,
        requester_stable_id=str(actor.pk), requester_snapshot=user_attribution_snapshot(actor),
        anchor=anchor, raised_from_discussion=discussion,
    )
    message = ReviewThreadMessage.objects.create(thread=thread, author=actor, author_snapshot=user_attribution_snapshot(actor))
    ReviewThreadMessageRevision.objects.create(message=message, sequence=1, action="create", body=_clean_body(body), actor=actor)
    participation = ReviewParticipation.objects.filter(submission=target.current_submission, actor=actor).first()
    if participation and participation.state == ReviewParticipation.State.REQUEST_CHANGES:
        history = list(participation.assessment_history)
        history.append({"assessment": participation.assessment, "state": participation.state, "recorded_at": participation.updated_at.isoformat()})
        participation.assessment_history = history
        participation.state = ReviewParticipation.State.UNDER_REVIEW
        participation.save(update_fields=("assessment_history", "state", "updated_at"))
    return _payload(thread, actor, role)


@transaction.atomic
def change_thread(entry, actor, thread_id, action):
    record, role = _record_for_entry(entry, actor)
    thread = get_object_or_404(ReviewThread.objects.select_for_update().select_related("target", "submission", "requester"), pk=thread_id, target__record=record)
    if role not in {"review", "edit"}:
        raise PermissionDenied("Review access is required to change feedback.")
    if action == "address":
        if thread.state != ReviewThread.State.OPEN:
            raise ValidationError("Only open feedback can be marked Addressed.")
        thread.state = ReviewThread.State.ADDRESSED
    elif action in {"resolve", "withdraw", "reopen"}:
        if thread.requester_id != actor.pk:
            raise PermissionDenied("Only the original requester can clear or reopen this blocker.")
        if role not in {"review", "edit"}:
            raise PermissionDenied("Current Review access is required to clear feedback.")
        if action == "reopen":
            if thread.submission_id != thread.target.current_submission_id or thread.state != ReviewThread.State.RESOLVED:
                raise ValidationError("A resolved request can only be reopened while its original submission is active.")
            thread.state = ReviewThread.State.OPEN
            thread.resolved_at = None
        else:
            if thread.state not in {ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED}:
                raise ValidationError("Only unresolved feedback can be cleared.")
            thread.state = ReviewThread.State.RESOLVED if action == "resolve" else ReviewThread.State.WITHDRAWN
            thread.resolved_at = timezone.now()
            thread.resolved_by_snapshot = user_attribution_snapshot(actor)
    else:
        raise ValidationError("Unsupported review thread action.")
    thread.save(update_fields=("state", "resolved_at", "resolved_by_snapshot", "updated_at"))
    return _payload(thread, actor, role)


@transaction.atomic
def reply_to_thread(entry, actor, thread_id, *, body, parent_id=None):
    record, role = _record_for_entry(entry, actor)
    if role not in {"review", "edit"}:
        raise PermissionDenied("Review access is required to reply.")
    thread = get_object_or_404(ReviewThread.objects.select_for_update(), pk=thread_id, target__record=record)
    if thread.state not in {ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED}:
        raise ValidationError("Resolved feedback cannot receive replies.")
    parent = get_object_or_404(ReviewThreadMessage, pk=parent_id, thread=thread) if parent_id else None
    message = ReviewThreadMessage.objects.create(thread=thread, parent=parent, author=actor, author_snapshot=user_attribution_snapshot(actor))
    ReviewThreadMessageRevision.objects.create(message=message, sequence=1, action="create", body=_clean_body(body), actor=actor)
    return _payload(thread, actor, role)


@transaction.atomic
def change_thread_message(entry, actor, thread_id, message_id, *, action, body=None):
    record, role = _record_for_entry(entry, actor)
    if role not in {"review", "edit"}:
        raise PermissionDenied("Review access is required to change messages.")
    thread = get_object_or_404(ReviewThread, pk=thread_id, target__record=record)
    message = get_object_or_404(ReviewThreadMessage.objects.select_for_update().prefetch_related("history"), pk=message_id, thread=thread)
    if message.author_id != actor.pk:
        raise PermissionDenied("You can only amend or retract your own messages.")
    previous = message.history.order_by("-sequence").first()
    if previous and previous.action == "retract":
        raise ValidationError("A retracted message cannot be changed again.")
    if action not in {"amend", "retract"}:
        raise ValidationError("Unsupported message action.")
    text = _clean_body(body) if action == "amend" else ""
    ReviewThreadMessageRevision.objects.create(message=message, sequence=(previous.sequence if previous else 0) + 1, action=action, body=text, actor=actor)
    return _payload(thread, actor, role)


@transaction.atomic
def assess_review(entry, actor, *, assessment, outcome):
    record, role = _record_for_entry(entry, actor)
    if role not in {"review", "edit"}:
        raise PermissionDenied("Review access is required to submit an assessment.")
    if not isinstance(assessment, str) or not assessment.strip():
        raise ValidationError({"assessment": "A final assessment is required."})
    target = ReviewTarget.objects.select_for_update().select_related("current_submission").filter(record=record).first()
    if target is None or target.state != ReviewTarget.State.SUBMITTED:
        raise ValidationError({"review": "There is no active submission."})
    participation = get_object_or_404(ReviewParticipation.objects.select_for_update(), submission=target.current_submission, actor=actor)
    own_open = ReviewThread.objects.filter(target=target, requester=actor, state__in=(ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED)).exists()
    if outcome != "request_changes" or not own_open:
        raise ValidationError({"outcome": "Request changes requires at least one of your unresolved requests."})
    history = list(participation.assessment_history)
    if participation.assessment:
        history.append({"assessment": participation.assessment, "state": participation.state, "recorded_at": participation.updated_at.isoformat()})
    participation.assessment = assessment.strip()
    participation.assessment_history = history
    participation.state = ReviewParticipation.State.REQUEST_CHANGES
    participation.save(update_fields=("assessment", "assessment_history", "state", "updated_at"))
    from helix_core.models import ActionLogEntry, ActionParticipant
    audit = ActionLogEntry.objects.create(
        performed_by=actor, action="helix.review.request_changes", action_type="reviewed",
        target_model_reference="helix.record", target_object_id=str(record.pk),
        initiating_mod_id=target.provider_mod_id, initiating_mod_version="unknown",
        metadata={"target_id": str(target.pk), "submission_id": str(target.current_submission_id),
                  "participation_id": str(participation.pk), "assessment": participation.assessment},
    )
    ActionParticipant.objects.create(
        action=audit, record=record, target_model_reference="helix.record",
        target_object_id=str(record.pk), role="subject",
    )
    return {"id": str(participation.pk), "submission_id": str(participation.submission_id), "state": participation.state, "assessment": participation.assessment, "assessment_history": participation.assessment_history}


def _clean_body(body):
    if not isinstance(body, str) or not body.strip() or len(body) > 20000:
        raise ValidationError({"body": "Message text must be between 1 and 20,000 characters."})
    return body.strip()
