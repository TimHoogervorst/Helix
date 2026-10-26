"""Platform API operations for exact-submission review participation and blockers."""

from copy import deepcopy
from uuid import UUID

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
        "suggestion": thread.suggestion, "suggestion_disposition": thread.suggestion_disposition,
        "suggestion_actor": thread.suggestion_actor_snapshot, "suggestion_result_revision_id": str(thread.suggestion_result_revision_id) if thread.suggestion_result_revision_id else None,
        "requester_is_actor": thread.requester_id == actor.pk,
        "blocking": thread.blocking and thread.state in {ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED},
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
    eligibility = _approval_eligibility(target, submission, actor, role) if target.current_submission_id else (False, "There is no active submission.", "readiness")
    return {
        "approval_available": eligibility[0], "approval_unavailable_reason": eligibility[1],
        "approval_unavailable_category": eligibility[2],
        "can_reopen": role == "edit" and target.state == ReviewTarget.State.FINISHED,
        "approval": None if not hasattr(submission, "approval") else {
            "id": str(submission.approval.pk), "witness": submission.approval.witness_snapshot,
            "assessment": submission.approval.assessment,
            "approved_at": submission.approval.approved_at,
        },
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
def create_review_thread(entry, actor, *, submission_id, anchor, body, discussion_id=None, suggestion=None):
    record, role = _record_for_entry(entry, actor)
    if role not in {"review", "edit"}:
        raise PermissionDenied("Review access is required to add feedback.")
    target = ReviewTarget.objects.select_for_update().select_related("current_submission").filter(record=record).first()
    if (target is None or target.state not in {ReviewTarget.State.SUBMITTED, ReviewTarget.State.FINISHED}
            or str(target.current_submission_id) != str(submission_id)):
        raise ValidationError({"submission_id": "Feedback must be bound to the exact current submission."})
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
    if suggestion is not None:
        if anchor.get("kind") != "text" or not isinstance(suggestion, dict) or set(suggestion) != {"replacement"}:
            raise ValidationError({"suggestion": "A replacement must target one selected text range."})
        replacement = suggestion.get("replacement")
        if not isinstance(replacement, str) or not replacement.strip() or len(replacement) > 5000:
            raise ValidationError({"suggestion": "Replacement text must be between 1 and 5,000 characters."})
        if not anchor.get("text") or len(anchor["text"]) > 5000:
            raise ValidationError({"suggestion": "The selected text cannot be replaced."})
        suggestion = {"replacement": replacement}
    thread = ReviewThread.objects.create(
        target=target, submission=target.current_submission, requester=actor,
        requester_stable_id=str(actor.pk), requester_snapshot=user_attribution_snapshot(actor),
        anchor=anchor, suggestion=suggestion or {}, raised_from_discussion=discussion,
        blocking=target.state == ReviewTarget.State.SUBMITTED,
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
    target = ReviewTarget.objects.select_for_update().filter(record=record).first()
    if target is None or target.state not in {ReviewTarget.State.SUBMITTED, ReviewTarget.State.FINISHED}:
        raise ValidationError("Feedback can only be changed on the current submission.")
    thread = get_object_or_404(ReviewThread.objects.select_for_update().select_related("target", "submission", "requester"), pk=thread_id, target__record=record)
    if target.state == ReviewTarget.State.FINISHED and thread.submission_id != target.current_submission_id:
        raise ValidationError("Only feedback on the finished submission can be changed.")
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
    target = ReviewTarget.objects.select_for_update().filter(record=record).first()
    if target is None or target.state not in {ReviewTarget.State.SUBMITTED, ReviewTarget.State.FINISHED}:
        raise ValidationError("Feedback can only be changed on the current submission.")
    thread = get_object_or_404(ReviewThread.objects.select_for_update(), pk=thread_id, target__record=record)
    if target.state == ReviewTarget.State.FINISHED and thread.submission_id != target.current_submission_id:
        raise ValidationError("Only feedback on the finished submission can receive replies.")
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
    target = ReviewTarget.objects.select_for_update().filter(record=record).first()
    if target is None or target.state not in {ReviewTarget.State.SUBMITTED, ReviewTarget.State.FINISHED}:
        raise ValidationError("Feedback can only be changed on the current submission.")
    thread = get_object_or_404(ReviewThread, pk=thread_id, target__record=record)
    if target.state == ReviewTarget.State.FINISHED and thread.submission_id != target.current_submission_id:
        raise ValidationError("Only feedback on the finished submission can be changed.")
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
def assess_review(entry, actor, *, assessment, outcome, request_id=None):
    if outcome == "approve":
        return approve_review(entry, actor=actor, assessment=assessment, request_id=request_id)
    record, role = _record_for_entry(entry, actor)
    if role not in {"review", "edit"}:
        raise PermissionDenied("Review access is required to submit an assessment.")
    if not isinstance(assessment, str) or not assessment.strip():
        raise ValidationError({"assessment": "A final assessment is required."})
    target = ReviewTarget.objects.select_for_update().select_related("current_submission").filter(record=record).first()
    if target is None or target.current_submission is None:
        raise ValidationError({"review": "There is no current submission."})
    participation = get_object_or_404(ReviewParticipation.objects.select_for_update(), submission=target.current_submission, actor=actor)
    if outcome == "finish_review":
        if target.state != ReviewTarget.State.FINISHED:
            raise ValidationError({"review": "Finish review is available after another witness finishes this submission."})
        if participation.state == ReviewParticipation.State.FINISHED:
            raise ValidationError({"review": "Your participation is already finished."})
        history = list(participation.assessment_history)
        if participation.assessment:
            history.append({"assessment": participation.assessment, "state": participation.state, "recorded_at": participation.updated_at.isoformat()})
        participation.assessment = assessment.strip()
        participation.assessment_history = history
        participation.state = ReviewParticipation.State.FINISHED
        participation.save(update_fields=("assessment", "assessment_history", "state", "updated_at"))
        from helix_core.models import ActionLogEntry, ActionParticipant
        audit = ActionLogEntry.objects.create(
            performed_by=actor, action="helix.review.finish_review", action_type="reviewed",
            target_model_reference="helix.record", target_object_id=str(record.pk),
            initiating_mod_id=target.provider_mod_id, initiating_mod_version="unknown",
            metadata={"target_id": str(target.pk), "submission_id": str(target.current_submission_id),
                      "participation_id": str(participation.pk), "assessment": participation.assessment},
        )
        ActionParticipant.objects.create(action=audit, record=record,
            target_model_reference="helix.record", target_object_id=str(record.pk), role="subject")
        return {"id": str(participation.pk), "submission_id": str(participation.submission_id),
                "state": participation.state, "assessment": participation.assessment,
                "assessment_history": participation.assessment_history}
    if target.state != ReviewTarget.State.SUBMITTED:
        raise ValidationError({"review": "Request changes is unavailable after the target is finished."})
    own_open = ReviewThread.objects.filter(
        target=target, submission=target.current_submission, requester=actor, blocking=True,
        state__in=(ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED),
    ).exists()
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


def _approval_eligibility(target, submission, actor, role):
    from helix_core.reviews import compatible_review_provider
    from helix_core.models import ActionParticipant, PlatformRecord, PlatformRendition, ReviewTarget as ReviewTargetModel

    if role not in {"review", "edit"}:
        return False, "Current Review access is required to approve.", "access"
    if target.state != ReviewTarget.State.SUBMITTED or target.current_submission_id != submission.pk:
        return False, "Approval requires the exact active submission.", "readiness"
    if not target.contributor_history_complete:
        return False, "Approval unavailable: contributor history incomplete.", "attribution"
    provider = compatible_review_provider(target)
    if provider is None:
        return False, "The registered review provider is unavailable or incompatible.", "readiness"
    manifest = submission.manifest or {}
    groups = manifest.get("groups")
    if (not provider.revision_groups or not isinstance(groups, dict) or set(groups) != set(provider.revision_groups)
            or submission.rendition_id is None or not submission.captured_evidence.get("pdf_attachment_id")
            or str(manifest.get("record_id")) != str(target.record_id)):
        return False, "The active submission is missing complete retained evidence.", "readiness"
    rendition = PlatformRendition.objects.filter(pk=submission.rendition_id).first()
    primary_group = groups.get(provider.revision_groups[0], {})
    if (rendition is None
            or str(rendition.attachment_id) != str(submission.captured_evidence.get("pdf_attachment_id"))
            or str(rendition.revision_id) != str(primary_group.get("revision_id"))
            or rendition.source_hash != str(primary_group.get("content_hash"))):
        return False, "The retained presentation does not match the exact active submission.", "readiness"
    excluded = set(target.contributors.values_list("actor_stable_id", flat=True))
    for record in (target.record,):
        contributors = _durably_tracked_contributors(record, ActionParticipant)
        if contributors is None:
            return False, "Approval unavailable: contributor history incomplete.", "attribution"
        excluded.update(contributors)
    for prior_submission in target.submissions.all():
        excluded.add(str(prior_submission.submitted_by_snapshot.get("id", "")))
        if prior_submission.submitted_by_id:
            excluded.add(str(prior_submission.submitted_by_id))
    external = manifest.get("captured_external_evidence") or {}
    for external_id, item in external.items():
        try:
            external_record = PlatformRecord.objects.get(pk=external_id)
        except (PlatformRecord.DoesNotExist, ValueError, TypeError):
            return False, "Approval unavailable: contributor history incomplete.", "attribution"
        if not isinstance(item, dict) or str(item.get("record_id")) != str(external_record.pk):
            return False, "Captured external evidence does not identify its exact record.", "readiness"
        indirect_target = ReviewTargetModel.objects.filter(record=external_record).first()
        if indirect_target is not None:
            if not indirect_target.contributor_history_complete:
                return False, "Approval unavailable: contributor history incomplete.", "attribution"
            excluded.update(indirect_target.contributors.values_list("actor_stable_id", flat=True))
        contributors = _durably_tracked_contributors(external_record, ActionParticipant)
        if contributors is None:
            return False, "Approval unavailable: contributor history incomplete.", "attribution"
        excluded.update(contributors)
    if ReviewThread.objects.filter(
        target=target, submission=submission,
        state__in=(ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED),
    ).exclude(requester_stable_id=str(actor.pk)).exists():
        return False, "Another reviewer has an outstanding blocking request.", "blockers"
    if str(actor.pk) in excluded:
        return False, "Contributors and submitters cannot witness this target.", "exclusion"
    return True, None, None


def _durably_tracked_contributors(record, action_participant_model):
    """Collect only retained Action and Revision attribution with a creation baseline."""
    actions = list(action_participant_model.objects.filter(
        record=record, action__action_type__in=("created", "edited"),
    ).select_related("action"))
    if not actions or not any(item.action.action_type == "created" for item in actions):
        return None
    contributors = set()
    for item in actions:
        contributor_id = item.action.performed_by_id or item.action.performed_by_snapshot.get("id")
        if not contributor_id:
            return None
        contributors.add(str(contributor_id))
    groups = list(record.revision_groups.all())
    if not groups:
        return None
    for group in groups:
        revisions = list(group.revisions.all())
        if not revisions or min(revision.sequence for revision in revisions) != 1:
            return None
        for revision in revisions:
            contributor_id = revision.created_by_id or revision.created_by_snapshot.get("id")
            if not contributor_id:
                return None
            contributors.add(str(contributor_id))
    return contributors


@transaction.atomic
def approve_review(entry=None, *, record_id=None, actor, assessment, request_id):
    from bundled.access.access.policies import effective_role
    from helix_core.models import (
        ActionLogEntry, ActionParticipant, ReviewApproval, ReviewTarget,
        PlatformRendition,
    )
    from helix_core.record_mutations import request_fingerprint
    from helix_core.record_persistence import StateConflict

    if record_id is None:
        record, role = _record_for_entry(entry, actor)
    else:
        try:
            record = PlatformRecord.objects.select_related("project").get(pk=record_id)
        except (PlatformRecord.DoesNotExist, ValueError, TypeError):
            raise NotFound("Review target not found.")
        role = effective_role(actor, record)
        if role not in {"read", "review", "edit"}:
            raise NotFound("Review target not found.")
    if not isinstance(assessment, str) or not assessment.strip():
        raise ValidationError({"assessment": "A final assessment is required."})
    try:
        request_uuid = UUID(str(request_id))
    except (TypeError, ValueError):
        raise ValidationError({"request_id": "A stable request UUID is required."})

    # All target transitions and record edits take this row lock first. This
    # serializes approval against withdrawal, blockers, and content changes.
    record = PlatformRecord.objects.select_for_update(of=("self",)).select_related("project").get(pk=record.pk)
    current_role = effective_role(actor, record)
    if current_role not in {"read", "review", "edit"}:
        raise PermissionDenied("You no longer have access to this approval outcome.")
    target = ReviewTarget.objects.select_for_update().select_related("current_submission").filter(record=record).first()
    if target is None:
        raise ValidationError({"review": "There is no active submission to approve."})
    replay = ReviewApproval.objects.filter(witness_stable_id=str(actor.pk), request_id=request_uuid).select_related("submission", "target").first()
    fingerprint = request_fingerprint({
        "record_id": str(record.pk), "submission_id": str(replay.submission_id if replay else target.current_submission_id),
        "assessment": assessment.strip(), "action": "approve-review",
    })
    if replay:
        if replay.request_fingerprint != fingerprint:
            raise StateConflict("This request ID was already used for a different approval.")
        return {"approval_id": str(replay.pk), "submission_id": str(replay.submission_id), "state": "finished", "replayed": True}
    if current_role not in {"review", "edit"}:
        raise PermissionDenied("Current Review access is required to approve.")
    submission = target.current_submission
    if submission is None:
        raise ValidationError({"review": "There is no active submission to approve."})
    allowed, reason, _ = _approval_eligibility(target, submission, actor, effective_role(actor, record))
    if not allowed:
        raise PermissionDenied(reason)
    participation = ReviewParticipation.objects.select_for_update().filter(submission=submission, actor=actor).first()
    if participation is None:
        raise PermissionDenied("Start review participation before approving.")
    blockers = ReviewThread.objects.select_for_update().filter(
        target=target, submission=submission,
        blocking=True,
        state__in=(ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED),
    )
    if blockers.exclude(requester_stable_id=str(actor.pk)).exists():
        raise ValidationError({"review": "Another reviewer has an outstanding blocking request."})
    # Resolve the whole request lineage: a carried request is one request,
    # though its current-round copy is the active blocker.
    own_blockers = list(ReviewThread.objects.select_for_update().filter(
        target=target, requester_stable_id=str(actor.pk),
        blocking=True,
        state__in=(ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED),
    ))
    now = timezone.now()
    for thread in own_blockers:
        thread.state = ReviewThread.State.RESOLVED
        thread.resolved_at = now
        thread.resolved_by_snapshot = user_attribution_snapshot(actor)
        thread.save(update_fields=("state", "resolved_at", "resolved_by_snapshot", "updated_at"))

    rendition = PlatformRendition.objects.select_related("attachment").get(pk=submission.rendition_id)
    evidence = {
        "manifest": deepcopy(submission.manifest),
        "captured_evidence": deepcopy(submission.captured_evidence),
        "rendition_id": str(rendition.pk),
        "revision_id": str(rendition.revision_id),
        "attachment_id": str(rendition.attachment_id),
        "source_hash": rendition.source_hash,
    }
    history = list(participation.assessment_history)
    if participation.assessment:
        history.append({"assessment": participation.assessment, "state": participation.state, "recorded_at": participation.updated_at.isoformat()})
    participation.assessment = assessment.strip()
    participation.assessment_history = history
    participation.state = ReviewParticipation.State.FINISHED
    participation.save(update_fields=("assessment", "assessment_history", "state", "updated_at"))
    approval = ReviewApproval.objects.create(
        target=target, submission=submission, participation=participation,
        witness=actor, witness_stable_id=str(actor.pk),
        witness_snapshot=user_attribution_snapshot(actor), assessment=assessment.strip(),
        retained_evidence=evidence, request_id=request_uuid,
        request_fingerprint=fingerprint, approved_at=now,
    )
    target.state = ReviewTarget.State.FINISHED
    target.save(update_fields=("state", "updated_at"))
    audit = ActionLogEntry.objects.create(
        performed_by=actor, action="helix.review.approved", action_type="reviewed",
        target_model_reference="helix.record", target_object_id=str(record.pk),
        initiating_mod_id=target.provider_mod_id, initiating_mod_version="unknown",
        request_id=request_uuid,
        metadata={"target_id": str(target.pk), "submission_id": str(submission.pk),
                  "approval_id": str(approval.pk), "assessment": approval.assessment,
                  "rendition_id": str(rendition.pk), "source_hash": rendition.source_hash},
    )
    ActionParticipant.objects.create(action=audit, record=record,
        target_model_reference="helix.record", target_object_id=str(record.pk), role="subject")
    return {"approval_id": str(approval.pk), "submission_id": str(submission.pk), "state": target.state, "replayed": False}


def _clean_body(body):
    if not isinstance(body, str) or not body.strip() or len(body) > 20000:
        raise ValidationError({"body": "Message text must be between 1 and 20,000 characters."})
    return body.strip()
