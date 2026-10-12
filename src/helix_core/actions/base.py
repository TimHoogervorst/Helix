"""Abstract base model for action logging.

Each mod creates its own concrete table that inherits from
``AbstractBaseAction``.  The static columns are shared across all
action tables.
"""

import uuid

from django.conf import settings
from django.db import models


class AbstractBaseAction(models.Model):
    """Abstract base for audit / activity log entries.

    Concrete subclasses (e.g. ``ElnAction``, ``LimsAction``) each get
    their own physical table.  ``managed = False`` on the abstract base
    is intentional — Django should never create a table for this model
    itself.
    """

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_actions",
    )
    action = models.CharField(
        max_length=128,
        help_text="Triple-dotted action identifier, e.g. 'eln.entry.created'.",
    )
    action_type = models.CharField(
        max_length=16,
        help_text="Core CRUD verb: 'created', 'edited', or 'deleted'.",
    )
    target_type = models.CharField(
        max_length=100,
        help_text="Namespaced target type, e.g. 'eln.entry' or 'lims.entity'.",
    )
    target_id = models.IntegerField(
        help_text="PK of the target record.",
    )
    version = models.ForeignKey(
        "eln.ContentVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Content version produced by this action. Null for non-versioned targets.",
    )
    request_id = models.UUIDField(
        null=True,
        blank=True,
        help_text="Correlation ID tying together action rows from the same HTTP request.",
    )
    client_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="Client IP auto-captured from the request.",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        managed = False
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.action} on {self.target_type}.{self.target_id}"
