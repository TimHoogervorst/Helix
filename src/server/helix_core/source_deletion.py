"""Deletion helpers for the polymorphic Source graph."""

from django.contrib.contenttypes.models import ContentType
from django.db import models


def delete_source_descendants(root: models.Model) -> None:
    """Delete every item reached from *root* through Source edges.

    Source is a generic relation, so Django cannot cascade it.
    """
    from core.models import Folder
    from mods.eln.models import NotebookEntry
    from mods.lims.models import Entity

    source_models = (Folder, NotebookEntry, Entity)
    source_types = {
        model: ContentType.objects.get_for_model(model, for_concrete_model=False).pk
        for model in source_models
    }
    root_type = ContentType.objects.get_for_model(root, for_concrete_model=False).pk
    pending = [(root_type, root.pk)]
    visited = set()
    descendants = {model: set() for model in source_models}

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
            descendants[model].update(child_ids)
            pending.extend((child_type, child_id) for child_id in child_ids)

    # Children must go first.  This also bypasses entity reference checks:
    # property references are not Source edges and must not block subtree
    # deletion or cause the referencing entity to be deleted.
    for model in reversed(source_models):
        ids = descendants[model]
        if ids:
            model.objects.filter(pk__in=ids).delete()
