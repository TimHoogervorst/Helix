from django.db import models

from helix_core.abstracts import AbstractEntity


class ConcreteTestEntity(AbstractEntity):
    content = models.JSONField(default=dict, blank=True)

    class Meta:
        app_label = "helix_core"
        db_table = "helix_test_concrete_entity"
