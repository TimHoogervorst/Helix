"""Dropdown model — a named set of options for dropdown columns to reference.

Dropdown (formerly "controlled vocabulary") provides the canonical list
of allowed values for Dropdown columns.  A dropdown column references a
dropdown by ``dropdownId`` in its column definition.

:class:`DropdownsAction` is the concrete action-log table for dropdown
CRUD operations.
"""

from django.db import models

from helix_core.actions.base import AbstractBaseAction


class Dropdown(models.Model):
    """A named, ordered list of options for dropdown-column validation.

    Options are stored as a JSON array so ordered retrieval is
    guaranteed.  No colour data is stored — option colours are derived
    deterministically via ``hash(option_value) % palette_size``.
    """

    name = models.CharField(max_length=200, unique=True)
    options = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered array of option-value strings.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dropdowns_dropdown"
        ordering = ["name"]

    def __str__(self):
        return self.name


class DropdownsAction(AbstractBaseAction):
    """Concrete action table for dropdown CRUD operations."""

    class Meta:
        db_table = "dropdowns_action"
        verbose_name = "Dropdowns action"
        verbose_name_plural = "Dropdowns actions"
