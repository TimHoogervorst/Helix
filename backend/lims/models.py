from django.db import models
from django.db.models.functions import Length


class EntityType(models.Model):
    """A type/category of LIMS entity (e.g., DNA, Chemical, Buffer).

    Carries a prefix for entity display_id generation and a JSON schema
    (``columns``) that defines the properties entities of this type can have.
    """

    name = models.CharField(max_length=255, unique=True)
    prefix = models.CharField(
        max_length=20,
        unique=True,
        help_text="Uppercase letters, e.g. BLOOD. Used to generate display IDs like BLOOD1.",
    )
    columns = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered array of column definitions: {name, type, required, default, units, description}.",
    )
    icon = models.CharField(
        max_length=10,
        default="🧪",
        help_text="Single emoji used as the icon for this entity type in reference badges.",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Soft-delete flag. Inactive schemas are hidden from dropdowns but preserve existing entities.",
    )

    class Meta:
        db_table = "lims_entity_type"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Entity(models.Model):
    """A structured LIMS entity representing a physical sample or item.

    display_id is auto-generated from the EntityType prefix on first save
    (same pattern as NotebookEntry.display_id).
    """

    display_id = models.CharField(
        max_length=50, unique=True, editable=False, null=True
    )
    name = models.CharField(max_length=500)
    entity_type = models.ForeignKey(
        EntityType, on_delete=models.CASCADE, related_name="entities"
    )
    properties = models.JSONField(default=dict, blank=True)
    source_entry = models.ForeignKey(
        "eln.NotebookEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lims_entities",
    )
    folder = models.ForeignKey(
        "core.Folder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="entities",
    )
    created_by = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="entities",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lims_entity"
        ordering = ["-created_at"]
        verbose_name_plural = "entities"

    def __str__(self):
        if self.display_id:
            return f"{self.display_id} — {self.name}"
        return f"{self.name} ({self.entity_type.name})"

    def save(self, *args, **kwargs):
        if self.display_id is None:
            prefix = self.entity_type.prefix
            last = (
                Entity.objects
                .filter(display_id__startswith=prefix)
                .annotate(id_len=Length("display_id"))
                .order_by("-id_len", "-display_id")
                .values_list("display_id", flat=True)
                .first()
            )
            if last:
                num = int(last[len(prefix):])
            else:
                num = 0
            self.display_id = f"{prefix}{num + 1}"
        super().save(*args, **kwargs)


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
