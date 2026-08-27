from django.db import models

from helix_core.abstracts import AbstractEntity
from helix_core.actions.base import AbstractBaseAction


class LimsView(models.Model):
    """A saved filter configuration for the Entities Hub.

    Stores the current URL filter state as a JSON blob so users can
    save, name, share, and restore their favourite views of the hub.
    """

    owner = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="lims_views",
    )
    name = models.CharField(max_length=255)
    filter_state = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Structured filter state equivalent to URL params: "
            "{ search, schema_type, schema, status, sort, fields, columns, viewMode }"
        ),
    )
    is_public = models.BooleanField(
        default=False,
        help_text="When True, the View appears in the Global Views sidebar for all users.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "lims_view"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ({self.owner.username})"


class Metric(models.Model):
    """A live aggregate calculated from a saved View's filter_state.

    Each Metric references a :class:`LimsView` and computes a scalar
    aggregate (count, sum, avg, min, max, stdev, or count_distinct) over
    the Entity Hub View for that View's current filter configuration.

    Metrics are live — their value endpoint re-queries the database on
    every request rather than caching a snapshot.
    """

    owner = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="lims_metrics",
    )
    name = models.CharField(max_length=255, blank=True)
    view = models.ForeignKey(
        LimsView,
        on_delete=models.CASCADE,
        related_name="metrics",
    )
    aggregate_function = models.CharField(
        max_length=50,
        help_text=(
            "Aggregate ID from the column type registry: "
            "count, count_distinct, sum, avg, min, max, stdev."
        ),
    )
    column = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text=(
            "Column key to aggregate over.  None/empty for a plain row "
            "count (counts rows without a column target)."
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "lims_metric"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.aggregate_function} — {self.name}"


class Entity(AbstractEntity):
    """A structured entity representing a physical sample or item.

    Inherits name, author, status, source, project, schema, properties,
    updated_at, display_id, and created_at from :class:`AbstractEntity`.

    display_id is auto-generated from the Schema prefix on first save.
    """

    tags = models.ManyToManyField(
        "tags.Tag",
        related_name="+",
        db_table="lims_tag_entities",
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

    Extends :class:`AbstractBaseAction` to add the LIMS-specific entity
    field while inheriting the shared action
    columns (``performed_by``, ``action``, ``action_type``,
    ``target_type``, ``target_id``, ``metadata``, ``created_at``).
    """

    ACTION_CHOICES = [
        ("created", "Created"),
        ("used", "Used"),
        ("measured", "Measured"),
        ("noted", "Noted"),
        ("transferred", "Transferred"),
        ("aliquoted", "Aliquoted"),
    ]

    entity = models.ForeignKey(Entity, on_delete=models.CASCADE, null=True, blank=True, related_name="actions")

    class Meta:
        db_table = "lims_action"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action_type} on {self.entity.name}"
