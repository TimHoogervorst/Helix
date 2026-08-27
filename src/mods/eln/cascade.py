"""Signal handler for status cascades over Source relationships."""

from helix_core.mod_system.registry import registry


def update_status_from_source(sender, instance, created, **kwargs):
    """Propagate an Entry or Entity status to its Source descendants."""
    if created:
        return

    from django.contrib.contenttypes.models import ContentType

    registry.call(
        "lims.cascadeSourceStatus",
        source_type_id=ContentType.objects.get_for_model(instance).pk,
        source_id=instance.pk,
        status=instance.status,
    )
