"""Deletion helpers for the polymorphic Source graph."""

from django.contrib.contenttypes.models import ContentType
from django.db import models, transaction


@transaction.atomic
def delete_source_descendants(root: models.Model, *, actor=None) -> None:
    """Delete every item reached from *root* through Source edges.

    Source is a generic relation, so Django cannot cascade it.
    """
    from helix_core.mod_system.registry import registry

    # Folders are valid roots without being provider-owned Sources. Registered
    # providers and Platform Records expose the generic Source edge.
    registered_sources = [
        (provider, model)
        for provider, model in registry.content_source_models()
        if all(
            field in {candidate.name for candidate in model._meta.get_fields()}
            for field in ("source_type", "source_id")
        )
    ]
    source_models = [model for _provider, model in registered_sources]
    from helix_core.models import PlatformRecord
    if PlatformRecord not in source_models:
        source_models.append(PlatformRecord)
    model_references = {
        model: str(provider.model_reference)
        for provider, model in registered_sources
    }
    model_references[PlatformRecord] = "helix.record"
    source_types = {
        model: ContentType.objects.get_for_model(model, for_concrete_model=False).pk
        for model in source_models
    }
    root_type = ContentType.objects.get_for_model(root, for_concrete_model=False).pk
    pending = [(root_type, root.pk)]
    visited = set()
    ordered_descendants = []
    model_by_type = {type_id: model for model, type_id in source_types.items()}

    while pending:
        source_type_id, source_id = pending.pop()
        marker = (source_type_id, source_id)
        if marker in visited:
            continue
        visited.add(marker)

        for model, child_type in source_types.items():
            child_ids = list(
                model.objects.filter(
                    source_type_id=source_type_id,
                    source_id=source_id,
                ).values_list("pk", flat=True)
            )
            ordered_descendants.extend((child_type, child_id) for child_id in child_ids)
            pending.extend((child_type, child_id) for child_id in child_ids)

    # Children must go first. Property references are not Source edges and
    # must not block subtree deletion or cause referencing records to delete.
    from helix_core.record_persistence import delete_platform_record, delete_source_entity
    for model_type, object_id in reversed(ordered_descendants):
        model = model_by_type[model_type]
        source = {"kind": "source-subtree", "type": root_type, "id": str(root.pk)}
        if model is PlatformRecord:
            try:
                record = PlatformRecord.objects.get(pk=object_id)
            except PlatformRecord.DoesNotExist:
                continue
            delete_platform_record(record, actor=actor, source=source)
        else:
            delete_source_entity(
                model,
                object_id,
                target_model_reference=model_references[model],
                actor=actor,
                source=source,
            )
