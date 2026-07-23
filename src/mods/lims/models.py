from django.db import models

from helix_core.abstracts import AbstractEntity
from helix_core.actions.base import AbstractBaseAction


class Entity(AbstractEntity):
    """A structured LIMS entity representing a physical sample or item.

    Inherits name, author, status, folder, project, schema, properties,
    updated_at, display_id, and created_at from :class:`AbstractEntity`.

    display_id is auto-generated from the Schema prefix on first save.
    """

    source_entry = models.ForeignKey(
        "eln.NotebookEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lims_entities",
    )

    class Meta:
        db_table = "lims_entity"
        ordering = ["-created_at"]
        verbose_name_plural = "entities"

    def __str__(self):
        if self.display_id:
            return f"{self.display_id} — {self.name}"
        return f"{self.name} ({self.schema.name})"


class Action(AbstractBaseAction):
    """A recorded action performed on an entity.

    Extends :class:`AbstractBaseAction` to add LIMS-specific fields
    (``entity``, ``source_entry``) while inheriting the shared action
    columns (``performed_by``, ``action_type``, ``target_type``,
    ``target_id``, ``metadata``, ``created_at``).
    """

    ACTION_CHOICES = [
        ("created", "Created"),
        ("used", "Used"),
        ("measured", "Measured"),
        ("noted", "Noted"),
        ("transferred", "Transferred"),
        ("aliquoted", "Aliquoted"),
    ]

    entity = models.ForeignKey(Entity, on_delete=models.CASCADE, related_name="actions")
    source_entry = models.ForeignKey(
        "eln.NotebookEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="actions",
    )

    class Meta:
        db_table = "lims_action"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action_type} on {self.entity.name}"
