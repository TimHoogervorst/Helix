"""
Tag — a pure value object reusable by any mod.

Tag has no awareness of what it tags. Each consuming mod defines its own
M2M to Tag (e.g. NotebookEntry.tags, Entity.tags).  Tag never holds
an FK or M2M of its own.
"""

from django.db import models

TAG_COLOR_CHOICES = [
    ("enzyme", "Enzyme"),
    ("flask", "Flask"),
    ("solvent", "Solvent"),
    ("warn", "Warn"),
    ("primary", "Primary"),
    ("success", "Success"),
    ("destructive", "Destructive"),
    ("muted", "Muted"),
]

TAG_ICON_CHOICES = [
    ("circle", "Circle"),
    ("dna", "DNA"),
    ("rat", "Rat"),
    ("leaf", "Leaf"),
    ("cog", "Machine"),
    ("notebook", "Entry"),
    ("user", "Person"),
    ("folder", "Folder"),
]


class Tag(models.Model):
    """A reusable label with name, colour, and icon.

    Pure value object — no M2M or FK to any consumer.  Consumers define
    their own :class:`~django.db.models.ManyToManyField` pointing here.
    """

    name = models.CharField(max_length=100, unique=True)
    color = models.CharField(max_length=50, choices=TAG_COLOR_CHOICES, default="muted")
    icon = models.CharField(max_length=50, choices=TAG_ICON_CHOICES, default="circle")

    class Meta:
        db_table = "tags_tag"
        ordering = ["name"]

    def __str__(self):
        return self.name
