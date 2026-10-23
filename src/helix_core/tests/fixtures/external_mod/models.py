from django.db import models

from helix_core.abstracts import AbstractEntity


class ConcreteTestEntity(AbstractEntity):
    content = models.JSONField(default=dict, blank=True)
    # Optional durable backing, as used by provider-owned document workspaces.
    platform_record = models.ForeignKey(
        "helix_core.PlatformRecord", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )

    class Meta:
        app_label = "helix_core"
        db_table = "helix_test_concrete_entity"
