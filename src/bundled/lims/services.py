from django.db import transaction


@transaction.atomic
def cascade_source_status(*, source_type_id: int, source_id: int, status: str) -> int:
    """Update every status-bearing item in a Source subtree.

    Source is polymorphic, so descendants are read from both the Entry and
    Entity tables. Queryset updates deliberately bypass ``post_save`` and
    keep the cascade synchronous without recursively re-entering this service.
    """
    from django.contrib.contenttypes.models import ContentType
    from django.db import transaction
    from helix_core.mod_system.registry import registry
    from helix_core.models import PlatformRecord, ReviewTarget
    from helix_core.record_persistence import StateConflict

    source_types = {
        ContentType.objects.get_for_model(model).pk: model
        for _provider, model in registry.content_source_models()
        if hasattr(model, "source_type_id") and hasattr(model, "status")
    }
    record_type = ContentType.objects.get_for_model(PlatformRecord).pk
    source_types[record_type] = PlatformRecord
    pending = [(source_type_id, source_id)]
    visited = set()
    updated = 0
    platform_record_ids = []

    while pending:
        parent_type_id, parent_id = pending.pop()
        marker = (parent_type_id, parent_id)
        if marker in visited:
            continue
        visited.add(marker)

        for child_type_id, model in source_types.items():
            children = model.objects.filter(
                source_type_id=parent_type_id,
                source_id=parent_id,
            )
            child_ids = list(children.values_list("pk", flat=True))
            if not child_ids:
                continue
            if model is PlatformRecord:
                platform_record_ids.extend(child_ids)
            pending.extend((child_type_id, child_id) for child_id in child_ids)

    locked_record_ids = list(
        PlatformRecord.objects.select_for_update().filter(pk__in=platform_record_ids)
        .order_by("pk").values_list("pk", flat=True)
    )
    if ReviewTarget.objects.filter(
        record_id__in=locked_record_ids,
        state__in=(ReviewTarget.State.SUBMITTED, ReviewTarget.State.FINISHED),
    ).exists():
        raise StateConflict("This status change would mutate a locked review target.")

    with transaction.atomic():
        pending = [(source_type_id, source_id)]
        visited = set()
        while pending:
            parent_type_id, parent_id = pending.pop()
            marker = (parent_type_id, parent_id)
            if marker in visited:
                continue
            visited.add(marker)
            for child_type_id, model in source_types.items():
                children = model.objects.filter(source_type_id=parent_type_id, source_id=parent_id)
                child_ids = list(children.values_list("pk", flat=True))
                if not child_ids:
                    continue
                updated += model.objects.filter(pk__in=child_ids).update(status=status)
                pending.extend((child_type_id, child_id) for child_id in child_ids)

    return updated
