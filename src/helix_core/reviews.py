"""Platform-owned submission and withdrawal operations for registered review targets."""

from __future__ import annotations

from copy import deepcopy
from uuid import UUID

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError


def record_review_content_effect(*, record, actor, provider_mod_id, group_key, effect):
    """Create new targets at their first saved content and retain each contributor."""
    from helix_core.models import ReviewContributor, ReviewTarget
    from helix_core.mod_system.registry import registry
    from helix_core.models import user_attribution_snapshot

    registrations = [
        item for item in registry._review_targets.values()
        if item.provider_mod_id == provider_mod_id and group_key in item.revision_groups
    ]
    if len(registrations) != 1:
        return
    provider = registrations[0]
    target, created = ReviewTarget.objects.get_or_create(
        record=record,
        defaults={
            "provider_mod_id": provider_mod_id,
            "registration_id": provider.identity,
            "creator_snapshot": user_attribution_snapshot(actor),
            # A target first seen on an edit may have older, unattributed
            # content. Only the record's original, tracked creation establishes
            # complete coverage from the beginning of its history.
            "contributor_history_complete": effect == "created",
        },
    )
    stable_id = str(getattr(actor, "pk", "anonymous"))
    ReviewContributor.objects.get_or_create(
        target=target,
        actor_stable_id=stable_id,
        defaults={
            "actor": actor if getattr(actor, "is_authenticated", False) else None,
            "actor_snapshot": user_attribution_snapshot(actor),
            "first_effect": "created" if created or effect == "created" else effect,
        },
    )


def record_review_metadata_effect(*, record, actor):
    """Retain attribution when record metadata or field values change."""
    from helix_core.models import ReviewContributor, ReviewTarget, user_attribution_snapshot

    target = ReviewTarget.objects.filter(record=record).first()
    if target is None:
        return
    stable_id = str(getattr(actor, "pk", "anonymous"))
    ReviewContributor.objects.get_or_create(
        target=target, actor_stable_id=stable_id,
        defaults={"actor": actor if getattr(actor, "is_authenticated", False) else None,
                  "actor_snapshot": user_attribution_snapshot(actor),
                  "first_effect": "metadata-edited"},
    )


def ensure_record_unlocked(record_or_id):
    """Reject edits while a submitted or finished review target is locked."""
    from helix_core.models import PlatformRecord, ReviewTarget

    record_id = getattr(record_or_id, "pk", record_or_id)
    target = ReviewTarget.objects.filter(record_id=record_id).only("state").first()
    if target and target.state in {ReviewTarget.State.SUBMITTED, ReviewTarget.State.FINISHED}:
        from helix_core.record_persistence import StateConflict

        raise StateConflict("This record is locked by its active review submission.")


def ensure_source_subtree_unlocked(root):
    """Reject Source moves that would relocate any actively reviewed record below root."""
    from django.contrib.contenttypes.models import ContentType
    from helix_core.core.models import Folder
    from helix_core.mod_system.registry import registry
    from helix_core.models import PlatformRecord, ReviewTarget
    from helix_core.record_persistence import StateConflict

    source_models = [model for _provider, model in registry.content_source_models()
                     if all(hasattr(model, field) for field in ("source_type_id", "source_id"))]
    if PlatformRecord not in source_models:
        source_models.append(PlatformRecord)
    if Folder not in source_models:
        source_models.append(Folder)
    model_types = {ContentType.objects.get_for_model(model, for_concrete_model=False).pk: model
                   for model in source_models}
    pending = [(ContentType.objects.get_for_model(root, for_concrete_model=False).pk, root.pk)]
    visited = set()
    record_ids = {str(root.platform_record_id)} if getattr(root, "platform_record_id", None) else set()
    while pending:
        parent_type, parent_id = pending.pop()
        marker = (parent_type, str(parent_id))
        if marker in visited:
            continue
        visited.add(marker)
        for child_type, model in model_types.items():
            children = model.objects.filter(source_type_id=parent_type, source_id=parent_id)
            child_ids = list(children.values_list("pk", flat=True))
            if model is PlatformRecord:
                record_ids.update(str(value) for value in child_ids)
            elif any(field.name == "platform_record" for field in model._meta.get_fields()):
                record_ids.update(str(value) for value in model.objects.filter(
                    pk__in=child_ids, platform_record_id__isnull=False,
                ).values_list("platform_record_id", flat=True))
            pending.extend((child_type, child_id) for child_id in child_ids)
    if not record_ids:
        return
    locked_ids = list(PlatformRecord.objects.select_for_update(of=("self",)).filter(
        pk__in=record_ids,
    ).order_by("pk").values_list("pk", flat=True))
    if ReviewTarget.objects.filter(
        record_id__in=locked_ids,
        state__in=(ReviewTarget.State.SUBMITTED, ReviewTarget.State.FINISHED),
    ).exists():
        raise StateConflict("This Source move would relocate a locked review target.")


def compatible_review_provider(target, record=None):
    """Return the provider only when its identity and declared scope still fit."""
    from helix_core.mod_system.registry import registry

    provider = registry.get_review_target(target.registration_id)
    if provider is None or provider.provider_mod_id != target.provider_mod_id:
        return None
    record = record or target.record
    reference_id = getattr(provider.target_model_reference, "id", provider.target_model_reference)
    target_model = registry.get_registered_models().get(reference_id)
    if isinstance(target_model, str):
        from django.apps import apps
        try:
            target_model = apps.get_model(target_model)
        except (LookupError, ValueError):
            return None
    if target_model is None:
        return None
    from django.contrib.contenttypes.models import ContentType
    if record.source_type_id != ContentType.objects.get_for_model(
        target_model, for_concrete_model=False,
    ).pk:
        return None
    groups = list(record.revision_groups.all())
    if not groups:
        return None
    registered_keys = set()
    for group in groups:
        registration = registry.resolve_revision_group_registration(
            group.target_model_reference, group.group_key,
        )
        if registration is None or registration["owner_mod_id"] != target.provider_mod_id:
            return None
        if str(group.target_object_id) != str(record.source_id):
            return None
        registered_keys.add(group.group_key)
    if registered_keys != set(provider.revision_groups):
        return None
    return provider


def review_target_state(record_id, *, actor):
    from bundled.access.access.policies import effective_role
    from helix_core.models import PlatformRecord, ReviewTarget

    try:
        record = PlatformRecord.objects.select_related("project").get(pk=record_id)
    except (PlatformRecord.DoesNotExist, ValueError, TypeError):
        raise NotFound("Record not found.")
    if effective_role(actor, record) not in {"read", "review", "edit"}:
        raise PermissionDenied("You do not have permission to read review history.")
    target = ReviewTarget.objects.filter(record=record).select_related("current_submission").first()
    if target is None:
        return {"available": True, "reason": None, "state": "authoring", "locked": False, "submissions": []}
    provider = compatible_review_provider(target, record)
    return {
        "available": provider is not None,
        "reason": None if provider else "The Mod that registered this review target is unavailable or incompatible.",
        "target_id": str(target.pk),
        "state": target.state,
        "locked": target.locked,
        "current_submission_id": str(target.current_submission_id) if target.current_submission_id else None,
        "submissions": [
            {
                "id": str(submission.pk),
                "round": submission.round_number,
                "manifest": deepcopy(submission.manifest),
                "submitted_by": submission.submitted_by_snapshot,
                "submitted_at": submission.submitted_at.isoformat(),
                "withdrawn_at": submission.withdrawn_at.isoformat() if submission.withdrawn_at else None,
                "rendition_id": str(submission.rendition_id) if submission.rendition_id else None,
                "download_url": (
                    f"/api/records/{record.pk}/attachments/{submission.rendition.attachment_id}/content/?revision_id={submission.rendition.revision_id}"
                    if submission.rendition_id and submission.rendition.attachment_id else None
                ),
            }
            for submission in target.submissions.select_related("rendition").order_by("round_number")
        ],
    }


def review_target_history(target_id, *, actor):
    """Read the complete retained review history using Platform-owned identity."""
    from bundled.access.access.policies import effective_role
    from helix_core.models import ReviewTarget

    try:
        target = ReviewTarget.objects.select_related("record__project", "current_submission").get(pk=target_id)
    except (ReviewTarget.DoesNotExist, ValueError, TypeError):
        raise NotFound("Review target not found.")
    record = target.record
    role = effective_role(actor, record)
    if role not in {"read", "review", "edit"}:
        raise PermissionDenied("You do not have permission to read review history.")

    from helix_core.review_threads import _payload
    from helix_core.models import ReviewThread

    submissions = []
    for submission in target.submissions.select_related("rendition").prefetch_related(
        "participations", "approval",
    ).order_by("round_number"):
        approval = getattr(submission, "approval", None)
        submissions.append({
            "id": str(submission.pk), "round": submission.round_number,
            "manifest": deepcopy(submission.manifest),
            "captured_evidence": deepcopy(submission.captured_evidence),
            "submitted_by": submission.submitted_by_snapshot,
            "submitted_at": submission.submitted_at,
            "withdrawn_by": submission.withdrawn_by_snapshot,
            "withdrawn_at": submission.withdrawn_at,
            "rendition_id": str(submission.rendition_id) if submission.rendition_id else None,
            "download_url": (
                f"/api/records/{record.pk}/attachments/{submission.rendition.attachment_id}/content/?revision_id={submission.rendition.revision_id}"
                if submission.rendition_id and submission.rendition.attachment_id else None
            ),
            "participations": [{
                "id": str(item.pk), "reviewer": item.actor_snapshot,
                "state": item.state, "assessment": item.assessment,
                "assessment_history": deepcopy(item.assessment_history),
                "started_at": item.started_at, "updated_at": item.updated_at,
            } for item in submission.participations.all()],
            "approval": None if approval is None else {
                "id": str(approval.pk), "witness": approval.witness_snapshot,
                "assessment": approval.assessment,
                "retained_evidence": deepcopy(approval.retained_evidence),
                "approved_at": approval.approved_at,
            },
        })
    threads = ReviewThread.objects.filter(target=target).select_related(
        "submission", "carried_from", "raised_from_discussion", "target",
    ).prefetch_related("messages__history")
    return {
        "target_id": str(target.pk), "record_id": str(record.pk),
        "provider_mod_id": target.provider_mod_id, "state": target.state,
        "current_submission_id": str(target.current_submission_id) if target.current_submission_id else None,
        "submissions": submissions,
        "threads": [_payload(thread, actor, role) for thread in threads],
    }


def submit_review_target(
    *, record_id, target_identity, actor, expected_state_token, expected_groups, request_id,
):
    """Render and atomically commit an immutable multi-group submission."""
    from bundled.access.access.policies import effective_role
    from helix_core.attachments import link_revision_attachments
    from helix_core.models import (
        ActionLogEntry, ActionParticipant, PlatformRecord, ReviewSubmission,
        ReviewTarget, RecordRevisionGroup,
    )
    from helix_core.mod_system.registry import registry
    from helix_core.record_persistence import StateConflict
    from helix_core.public import upload_attachment

    try:
        request_uuid = UUID(str(request_id))
    except (TypeError, ValueError):
        raise ValidationError({"request_id": "A stable request UUID is required."})
    from helix_core.record_mutations import request_fingerprint
    fingerprint = request_fingerprint({
        "record_id": str(record_id), "target_identity": target_identity,
        "state_token": str(expected_state_token), "groups": expected_groups,
    })
    try:
        record = PlatformRecord.objects.select_related("project").get(pk=record_id)
    except (PlatformRecord.DoesNotExist, ValueError, TypeError):
        raise NotFound("Record not found.")
    actor_role = effective_role(actor, record)
    prior = ReviewSubmission.objects.select_related("target", "rendition").filter(
        submitted_by=actor, request_id=request_uuid,
    ).first()
    if prior is not None:
        if prior.request_fingerprint != fingerprint:
            raise StateConflict("This request ID was already used for a different submission.")
        if actor_role not in {"read", "edit"}:
            raise PermissionDenied("You no longer have permission to access this submission outcome.")
        return _submission_response(prior, record, replayed=True)
    if actor_role != "edit":
        raise PermissionDenied("You need Edit permission to submit this record.")
    provider = registry.get_review_target(target_identity)
    if provider is None:
        raise ValidationError({"target": "This Mod has no active review registration."})
    if not isinstance(expected_groups, dict) or set(expected_groups) != set(provider.revision_groups):
        raise ValidationError({"expected_groups": "Name the exact current Revision for every registered group."})
    if str(record.state_token) != str(expected_state_token):
        raise StateConflict("The reviewed record changed before submission.")

    groups = list(
        RecordRevisionGroup.objects.filter(record=record, group_key__in=provider.revision_groups)
        .select_related("current_revision").order_by("group_key")
    )
    if {group.group_key for group in groups} != set(provider.revision_groups):
        raise ValidationError({"target": "A registered Revision Group is not ready for review."})
    revisions = {}
    for group in groups:
        revision = group.current_revision
        if revision is None or str(revision.pk) != str(expected_groups.get(group.group_key)):
            raise StateConflict("A reviewed Revision Group changed before submission.")
        revisions[group.group_key] = {
            "group_id": str(group.pk), "revision_id": str(revision.pk),
            "sequence": revision.sequence, "content_hash": revision.content_hash,
            "snapshot": deepcopy(revision.snapshot),
        }
    manifest = {
        "format_version": 1,
        "record_id": str(record.pk),
        "reviewed_metadata": {
            "name": record.name,
            "description": (record.properties or {}).get("description", ""),
            "properties": deepcopy(record.properties or {}),
            "field_values": deepcopy(record.field_values or {}),
        },
        "groups": revisions,
        "captured_external_evidence": {},
    }
    try:
        if provider.evidence_capture is not None:
            evidence = provider.evidence_capture(manifest=deepcopy(manifest), project_id=record.project_id, actor=actor)
            if not isinstance(evidence, dict):
                raise ValueError("The review evidence adapter did not return structured evidence.")
            manifest["captured_external_evidence"] = deepcopy(evidence)
        rendered = provider.renderer(manifest=deepcopy(manifest), project_id=record.project_id)
        if not isinstance(rendered, (bytes, bytearray)) or not rendered:
            raise ValueError("The review renderer returned no PDF bytes.")
        expected_pdf = rendered.startswith(b"%PDF-")
        if not expected_pdf:
            raise ValueError("The review renderer did not return a PDF.")
        upload = ContentFile(bytes(rendered), name=f"review-{record.display_id}.pdf")
        upload.content_type = "application/pdf"
        attachment = upload_attachment(project=record.project, actor=actor, uploaded_file=upload)
    except Exception as exc:
        raise ValidationError({"rendering": f"Submission evidence could not be captured and rendered faithfully: {exc}"}) from exc

    try:
        with transaction.atomic():
            locked = PlatformRecord.objects.select_for_update(of=("self",)).select_related("project").get(pk=record.pk)
            if effective_role(actor, locked) != "edit":
                raise PermissionDenied("You need Edit permission to submit this record.")
            if str(locked.state_token) != str(expected_state_token):
                raise StateConflict("The reviewed record changed while its evidence was being prepared.")
            prior = ReviewSubmission.objects.select_for_update().select_related(
                "target", "rendition"
            ).filter(submitted_by=actor, request_id=request_uuid).first()
            if prior is not None:
                if prior.request_fingerprint != fingerprint:
                    raise StateConflict("This request ID was already used for a different submission.")
                default_storage.delete(attachment.storage_key)
                from helix_core.models import PlatformAttachment
                PlatformAttachment.objects.filter(pk=attachment.pk, status="staged").delete()
                return _submission_response(prior, locked, replayed=True)
            locked_groups = list(
                RecordRevisionGroup.objects.select_for_update(of=("self",)).select_related("current_revision")
                .filter(record=locked, group_key__in=provider.revision_groups).order_by("group_key")
            )
            current = {g.group_key: str(g.current_revision_id) for g in locked_groups}
            if current != {key: str(value) for key, value in expected_groups.items()}:
                raise StateConflict("A reviewed Revision Group changed while its evidence was being prepared.")
            target, _ = ReviewTarget.objects.select_for_update().get_or_create(
                record=locked,
                defaults={
                    "provider_mod_id": provider.provider_mod_id or target_identity.split(":", 1)[0],
                    "registration_id": target_identity,
                },
            )
            if target.state != ReviewTarget.State.AUTHORING:
                raise StateConflict("Withdraw the active submission before submitting another review round.")
            if target.provider_mod_id != provider.provider_mod_id:
                raise StateConflict("The registered review provider does not match the existing target.")
            primary_group = next(g for g in locked_groups if g.group_key == provider.revision_groups[0])
            primary_revision = primary_group.current_revision
            link_revision_attachments(
                project_id=locked.project_id,
                values={"type": "attachmentReference", "value": {"id": str(attachment.pk)}},
                revision=primary_revision,
            )
            from helix_core.public import retain_rendition
            rendition = retain_rendition(
                record_id=locked.pk, group_id=primary_group.pk, revision_id=primary_revision.pk,
                attachment_id=attachment.pk, source_hash=primary_revision.content_hash,
                actor=actor, captured_at=timezone.now(),
                presentation_provider=f"{target_identity}.renderer",
                presentation_version=provider.renderer_version,
                presentation_context={"format": "pdf", "manifest_version": 1},
            )
            previous_submission = target.submissions.order_by("-round_number").first()
            submission = ReviewSubmission.objects.create(
                target=target, round_number=target.submissions.count() + 1,
                manifest=manifest,
                captured_evidence={"pdf_attachment_id": str(attachment.pk)},
                rendition=rendition, submitted_by=actor,
                request_id=request_uuid, request_fingerprint=fingerprint,
            )
            # Unresolved blockers follow the target into each fresh round, while
            # retaining their original submission and anchor as immutable context.
            from helix_core.models import ReviewThread
            for blocker in ReviewThread.objects.filter(
                target=target, submission=previous_submission,
                blocking=True,
                state__in=(ReviewThread.State.OPEN, ReviewThread.State.ADDRESSED),
            ).select_related("requester").order_by("created_at"):
                ReviewThread.objects.create(
                    target=target, submission=submission, carried_from=blocker,
                    requester=blocker.requester,
                    requester_stable_id=blocker.requester_stable_id,
                    requester_snapshot=deepcopy(blocker.requester_snapshot),
                    anchor=deepcopy(blocker.anchor), state=blocker.state,
                    suggestion=deepcopy(blocker.suggestion),
                    suggestion_disposition=blocker.suggestion_disposition,
                    suggestion_actor_snapshot=deepcopy(blocker.suggestion_actor_snapshot),
                    suggestion_result_revision=blocker.suggestion_result_revision,
                )
            target.state = ReviewTarget.State.SUBMITTED
            target.current_submission = submission
            target.save(update_fields=["state", "current_submission", "updated_at"])
            audit = ActionLogEntry.objects.create(
                performed_by=actor, action="helix.review.submitted", action_type="submitted",
                target_model_reference="helix.record", target_object_id=str(locked.pk),
                initiating_mod_id=provider.provider_mod_id or "unknown",
                initiating_mod_version="unknown",
                metadata={"target_id": str(target.pk), "submission_id": str(submission.pk),
                          "round": submission.round_number, "rendition_id": str(rendition.pk)},
            )
            ActionParticipant.objects.create(
                action=audit, record=locked, target_model_reference="helix.record",
                target_object_id=str(locked.pk), role="subject",
            )
        return {
            "target_id": str(target.pk), "submission_id": str(submission.pk),
            "round": submission.round_number, "state": target.state,
            "manifest": manifest, "rendition_id": str(rendition.pk),
            "attachment_id": str(attachment.pk), "replayed": False,
        }
    except Exception:
        default_storage.delete(attachment.storage_key)
        from helix_core.models import PlatformAttachment
        PlatformAttachment.objects.filter(pk=attachment.pk, status="staged").delete()
        raise


def _submission_response(submission, record, *, replayed):
    rendition = submission.rendition
    attachment_id = str(rendition.attachment_id) if rendition else None
    revision_id = rendition.revision_id if rendition else None
    return {
        "target_id": str(submission.target_id), "submission_id": str(submission.pk),
        "round": submission.round_number, "state": "submitted",
        "manifest": deepcopy(submission.manifest),
        "rendition_id": str(rendition.pk) if rendition else None,
        "attachment_id": attachment_id,
        "download_url": (
            f"/api/records/{record.pk}/attachments/{attachment_id}/content/?revision_id={revision_id}"
            if attachment_id and revision_id else None
        ),
        "replayed": replayed,
    }


@transaction.atomic
def withdraw_review_submission(*, record_id, actor, request_id):
    from bundled.access.access.policies import effective_role
    from helix_core.models import ActionLogEntry, ActionParticipant, PlatformRecord, ReviewSubmission, ReviewTarget
    from helix_core.record_mutations import request_fingerprint

    try:
        request_uuid = UUID(str(request_id))
    except (TypeError, ValueError):
        raise ValidationError({"request_id": "A stable request UUID is required."})

    try:
        record = PlatformRecord.objects.select_for_update(of=("self",)).select_related("project").get(pk=record_id)
    except (PlatformRecord.DoesNotExist, ValueError, TypeError):
        raise NotFound("Record not found.")
    if effective_role(actor, record) != "edit":
        raise PermissionDenied("You need Edit permission to withdraw this submission.")
    actor_stable_id = str(actor.pk)
    fingerprint = request_fingerprint({"record_id": str(record.pk), "action": "withdraw-review"})
    previous = ReviewSubmission.objects.filter(
        withdraw_actor_stable_id=actor_stable_id, withdraw_request_id=request_uuid,
    ).select_related("target").first()
    if previous is not None:
        if previous.withdraw_request_fingerprint != fingerprint:
            from helix_core.record_persistence import StateConflict
            raise StateConflict("This request ID was already used for a different withdrawal.")
        return {"target_id": str(previous.target_id), "submission_id": str(previous.pk),
                "state": "authoring", "replayed": True}
    target = ReviewTarget.objects.select_for_update().select_related("current_submission").filter(record=record).first()
    if target is None or target.state != ReviewTarget.State.SUBMITTED or target.current_submission is None:
        raise ValidationError({"review": "There is no active submission to withdraw."})
    if compatible_review_provider(target, record) is None:
        raise ValidationError({"review": "The registered review Mod is unavailable or incompatible; the target remains locked."})
    submission = target.current_submission
    submission.withdraw_actor_stable_id = actor_stable_id
    submission.withdraw_request_id = request_uuid
    submission.withdraw_request_fingerprint = fingerprint
    submission.withdrawn_by_snapshot = {
        "id": str(actor.pk), "username": actor.username,
        "displayName": actor.get_full_name().strip() or actor.username,
    }
    submission.withdrawn_at = timezone.now()
    submission.save(update_fields=["withdraw_actor_stable_id", "withdraw_request_id",
                                   "withdraw_request_fingerprint", "withdrawn_by_snapshot", "withdrawn_at"])
    target.state = ReviewTarget.State.AUTHORING
    target.current_submission = None
    target.save(update_fields=["state", "current_submission", "updated_at"])
    audit = ActionLogEntry.objects.create(
        performed_by=actor, action="helix.review.withdrawn", action_type="withdrawn",
        target_model_reference="helix.record", target_object_id=str(record.pk),
        initiating_mod_id=target.provider_mod_id, initiating_mod_version="unknown",
        metadata={"target_id": str(target.pk), "submission_id": str(submission.pk)},
    )
    ActionParticipant.objects.create(
        action=audit, record=record, target_model_reference="helix.record",
        target_object_id=str(record.pk), role="subject",
    )
    return {"target_id": str(target.pk), "submission_id": str(submission.pk),
            "state": target.state, "replayed": False}


@transaction.atomic
def reopen_review_target(*, record_id, actor, reason):
    """Return a finished target to authoring with an immutable reasoned event."""
    from bundled.access.access.policies import effective_role
    from helix_core.models import (
        ActionLogEntry, ActionParticipant, PlatformRecord, ReviewApproval,
        ReviewReopen, ReviewTarget, user_attribution_snapshot,
    )
    if not isinstance(reason, str) or not reason.strip() or len(reason.strip()) > 20000:
        raise ValidationError({"reason": "A reason of 1 to 20,000 characters is required."})
    try:
        record = PlatformRecord.objects.select_for_update(of=("self",)).select_related("project").get(pk=record_id)
    except (PlatformRecord.DoesNotExist, ValueError, TypeError):
        raise NotFound("Record not found.")
    if effective_role(actor, record) != "edit":
        raise PermissionDenied("You need Edit permission to reopen this target.")
    target = ReviewTarget.objects.select_for_update().filter(record=record).first()
    if target is None or target.state != ReviewTarget.State.FINISHED:
        raise ValidationError({"review": "Only a finished target can be reopened."})
    if compatible_review_provider(target, record) is None:
        raise ValidationError({"review": "The registered review Mod is unavailable or incompatible; the target remains locked."})
    approval = ReviewApproval.objects.filter(target=target).order_by("-approved_at").first()
    if approval is None:
        raise ValidationError({"review": "The finished target has no retained witness approval."})
    reopened = ReviewReopen.objects.create(
        target=target, approval=approval, actor=actor,
        actor_stable_id=str(actor.pk), actor_snapshot=user_attribution_snapshot(actor),
        reason=reason.strip(), reopened_at=timezone.now(),
    )
    target.state = ReviewTarget.State.AUTHORING
    target.current_submission = None
    target.save(update_fields=("state", "current_submission", "updated_at"))
    audit = ActionLogEntry.objects.create(
        performed_by=actor, action="helix.review.reopened", action_type="reviewed",
        target_model_reference="helix.record", target_object_id=str(record.pk),
        initiating_mod_id=target.provider_mod_id, initiating_mod_version="unknown",
        metadata={"target_id": str(target.pk), "approval_id": str(approval.pk),
                  "reopen_id": str(reopened.pk), "reason": reopened.reason},
    )
    ActionParticipant.objects.create(action=audit, record=record,
        target_model_reference="helix.record", target_object_id=str(record.pk), role="subject")
    return {"target_id": str(target.pk), "state": target.state,
            "reopen_id": str(reopened.pk), "approval_id": str(approval.pk)}
