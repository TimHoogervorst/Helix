"""Abstract base model for action logging.

.. WARNING:: Keep in sync with ``core/actions/base.py`` during the
   expand-contract transition.  Once the contract phase lands (all mods
   import from ``helix_core``), the original in ``core/`` will be removed.
"""

Each mod creates its own concrete table that inherits from
``AbstractBaseAction``.  The six static columns are shared across all
action tables.
"""

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
        on_delete=models.CASCADE,
        related_name="%(class)s_actions",
    )
    action_type = models.CharField(max_length=50)
    target_type = models.CharField(
        max_length=100,
        help_text="Namespaced target type, e.g. 'eln.entry' or 'lims.entity'.",
    )
    target_id = models.IntegerField(
        help_text="PK of the target record.",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        managed = False
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.action_type} on {self.target_type}.{self.target_id}"
