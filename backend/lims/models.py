from django.db import models


class EntityType(models.Model):
    """A type/category of LIMS entity (e.g., DNA, Chemical, Buffer)."""

    name = models.CharField(max_length=255, unique=True)

    class Meta:
        db_table = "lims_entity_type"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Entity(models.Model):
    """A structured LIMS entity representing a physical sample or item."""

    name = models.CharField(max_length=500)
    entity_type = models.ForeignKey(
        EntityType, on_delete=models.CASCADE, related_name="entities"
    )
    barcode = models.CharField(max_length=255, unique=True, null=True, blank=True)
    properties = models.JSONField(default=dict, blank=True)
    folder = models.ForeignKey(
        "core.Folder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="entities",
    )
    created_by = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="entities"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lims_entity"
        ordering = ["-created_at"]
        verbose_name_plural = "entities"

    def __str__(self):
        return f"{self.name} ({self.entity_type.name})"


class Action(models.Model):
    """A recorded action performed on an entity."""

    ACTION_CHOICES = [
        ("created", "Created"),
        ("used", "Used"),
        ("measured", "Measured"),
        ("noted", "Noted"),
        ("transferred", "Transferred"),
        ("aliquoted", "Aliquoted"),
    ]

    entity = models.ForeignKey(Entity, on_delete=models.CASCADE, related_name="actions")
    action_type = models.CharField(max_length=50, choices=ACTION_CHOICES)
    performed_by = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="actions"
    )
    source_entry = models.ForeignKey(
        "eln.NotebookEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="actions",
    )
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lims_action"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action_type} on {self.entity.name}"
