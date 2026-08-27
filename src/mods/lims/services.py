def cascade_source_status(*, source_type_id: int, source_id: int, status: str) -> int:
    """Update every status-bearing item in a Source subtree.

    Source is polymorphic, so descendants are read from both the Entry and
    Entity tables. Queryset updates deliberately bypass ``post_save`` and
    keep the cascade synchronous without recursively re-entering this service.
    """
    from django.contrib.contenttypes.models import ContentType

    from mods.eln.models import NotebookEntry

    from .models import Entity

    source_types = {
        ContentType.objects.get_for_model(NotebookEntry).pk: NotebookEntry,
        ContentType.objects.get_for_model(Entity).pk: Entity,
    }
    pending = [(source_type_id, source_id)]
    visited = set()
    updated = 0

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
            updated += model.objects.filter(pk__in=child_ids).update(status=status)
            pending.extend((child_type_id, child_id) for child_id in child_ids)

    return updated
