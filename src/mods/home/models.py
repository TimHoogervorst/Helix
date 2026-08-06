"""Metric Card model — a Metric pinned to a surface with presentation config.

Global cards (owner=None) appear on every user's surface and are read-only
over the API.  Personal cards are owned by a specific user.
"""

from django.db import models


class Card(models.Model):
    owner = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="home_cards",
        help_text="Null for global/system-owned cards shown to everyone.",
    )
    metric = models.ForeignKey(
        "lims.Metric",
        on_delete=models.CASCADE,
        related_name="cards",
    )
    surface = models.CharField(
        max_length=50,
        default="home",
        help_text="Surface key this card appears on (e.g. home, profile).",
    )
    order = models.PositiveIntegerField(
        default=0,
        help_text="Display order within the surface (lower = first).",
    )
    label = models.CharField(max_length=255, blank=True)
    icon = models.CharField(
        max_length=100,
        default="flask-conical",
        help_text="Lucide icon token.",
    )
    formatting = models.JSONField(
        default=dict,
        blank=True,
        help_text="Conditional-formatting rules + default style.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "home_card"
        ordering = ["surface", "order"]

    def __str__(self):
        owner_label = self.owner.username if self.owner else "global"
        return f"{self.label or 'Card'} ({owner_label})"

    @property
    def is_global(self):
        return self.owner is None
