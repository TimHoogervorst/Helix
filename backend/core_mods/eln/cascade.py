"""Signal handler that cascades NotebookEntry status changes to linked Entities.

When a NotebookEntry's status is updated, all Entities whose
``source_entry`` points to that entry have their status updated to match.

This replaces the previous approach of doing the cascade inline in
``NotebookEntry.save()`` — the signal is the seam between ELN and LIMS.
See ADR-0005 for the cascade decision.
"""


def update_entity_status_from_entry(sender, instance, created, **kwargs):
    """Propagate NotebookEntry status changes to linked Entity rows.

    Connected to Django's ``post_save`` signal for ``NotebookEntry``
    in :meth:`ElnConfig.ready`.  Fires on every non-create save — the
    ``Entity.objects.filter(...).update()`` query is a direct SQL UPDATE
    that doesn't instantiate model objects, so running it when the status
    hasn't changed is a cheap no-op.
    """
    if created:
        return

    from core_mods.lims.models import Entity

    Entity.objects.filter(source_entry=instance).update(status=instance.status)
