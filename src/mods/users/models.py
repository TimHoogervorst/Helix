"""Models for the users core-mod.

``CoreAction`` is the concrete action-log table for admin user operations
(create, deactivate, etc.).  It inherits the six static columns from
``AbstractBaseAction``.

Profile list models — ``Affiliation``, ``Publication``, ``Recognition`` —
each belong to a ``User`` and carry an ``order`` field for manual ordering.
"""

from django.conf import settings
from django.db import models

from helix_core.actions.base import AbstractBaseAction


class CoreAction(AbstractBaseAction):
    """Concrete action table for admin user-management operations."""

    class Meta:
        db_table = "core_action"
        verbose_name = "Core action"
        verbose_name_plural = "Core actions"


class Affiliation(models.Model):
    """A professional affiliation belonging to a user (e.g. lab, institution)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="affiliations",
    )
    institution = models.CharField(max_length=255)
    role = models.CharField(max_length=255, blank=True, default="")
    department = models.CharField(max_length=255, blank=True, default="")
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "user_affiliation"
        ordering = ["order", "-start_date"]

    def __str__(self):
        return f"{self.role or 'Position'} @ {self.institution}"


class Publication(models.Model):
    """A publication belonging to a user."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="publications",
    )
    title = models.CharField(max_length=500)
    journal = models.CharField(max_length=255, blank=True, default="")
    year = models.IntegerField(null=True, blank=True)
    role = models.CharField(max_length=255, blank=True, default="")
    url = models.URLField(max_length=1000, blank=True, default="")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "user_publication"
        ordering = ["order", "-year"]

    def __str__(self):
        return self.title


class Recognition(models.Model):
    """An award, fellowship, honour, or recognition belonging to a user."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="recognitions",
    )
    title = models.CharField(max_length=500)
    issuer = models.CharField(max_length=255, blank=True, default="")
    date = models.CharField(
        max_length=50, blank=True, default="",
        help_text="Free-text date, e.g. '2024' or 'Q2 2026'",
    )
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "user_recognition"
        ordering = ["order", "-date"]

    def __str__(self):
        return self.title
