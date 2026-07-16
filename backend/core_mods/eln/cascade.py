"""Signal handler that cascades NotebookEntry status changes to linked Entities.

When a NotebookEntry's status is updated, all Entities whose
``source_entry`` points to that entry have their status updated to match.

The cascade is performed via the service registry
(``registry.call("lims.cascadeEntryStatus", ...)``) rather than a direct
import of LIMS models.  This keeps the behavioural cross-mod boundary
clean — ELN asks LIMS to do the work, LIMS owns the implementation.

See ADR-0005 for the cascade decision.
"""

from helix_core.mod_system.registry import registry


def update_entity_status_from_entry(sender, instance, created, **kwargs):
    """Propagate NotebookEntry status changes to linked Entity rows.

    Connected to Django's ``post_save`` signal for ``NotebookEntry``
    in :meth:`ElnConfig.ready`.  Fires on every non-create save.  The
    underlying query is a direct SQL UPDATE that doesn't instantiate
    model objects, so running it when the status hasn't changed is a
    cheap no-op.
    """
    if created:
        return

    registry.call(
        "lims.cascadeEntryStatus",
        source_entry_id=instance.pk,
        status=instance.status,
    )
