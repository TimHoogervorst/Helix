"""Generic signal adapter for status propagation over registered sources."""

from django.contrib.contenttypes.models import ContentType

from helix_core.mod_system.registry import registry


def update_status_from_source(sender, instance, created, **kwargs):
    """Ask the registered source service to propagate a saved status.

    This adapter deliberately knows nothing about the model that emitted the
    signal.  Individual mods register it for models they own; the service
    provider discovers status-bearing source types through the registry.
    """
    if created:
        return

    registry.call(
        "lims.cascadeSourceStatus",
        source_type_id=ContentType.objects.get_for_model(instance).pk,
        source_id=instance.pk,
        status=instance.status,
    )
