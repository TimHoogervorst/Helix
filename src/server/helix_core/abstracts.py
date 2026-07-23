"""Abstract base classes shared across apps.

BrowsableItem provides the auto-generated display_id and created_at
fields used by any model that appears in the console Master Panel
(NotebookEntry, Entity, etc.).

AbstractEntity extends BrowsableItem with the common fields shared by
all entity-like models across mods — name, author, status, folder,
schema, properties, etc.

This is the canonical location — mods import from ``helix_core``.
``core/abstracts.py`` is a thin re-export for backward compatibility.
"""

from django.db import models
from django.db.models.functions import Length


class BrowsableItem(models.Model):
    """Abstract model for items that appear in the three-panel console UI.

    Provides:
    * ``display_id`` — unique human-readable ID auto-generated on first save
    * ``created_at`` — timestamp set at creation
    * ``generate_display_id(prefix)`` — static method to compute the next ID
    * ``save()`` — auto-populates display_id when the instance is new

    Subclasses **must** override ``_get_display_id_prefix()`` to return the
    prefix string used for display_id generation.
    """

    display_id = models.CharField(
        max_length=50, unique=True, editable=False, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True

    def _get_display_id_prefix(self) -> str:
        """Return the prefix for display_id generation.

        Override in each concrete subclass.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement _get_display_id_prefix()"
        )

    @classmethod
    def generate_display_id(cls, prefix: str) -> str:
        """Return the next available display_id for the given *prefix*.

        Scans the model's table for the highest existing numeric suffix and
        increments by one.  The first ID for a prefix is ``f"{prefix}1"``.
        """
        last = (
            cls.objects.filter(display_id__startswith=prefix)
            .annotate(id_len=Length("display_id"))
            .order_by("-id_len", "-display_id")
            .values_list("display_id", flat=True)
            .first()
        )
        if last:
            num = int(last[len(prefix):])
        else:
            num = 0
        return f"{prefix}{num + 1}"

    def save(self, *args, **kwargs):
        if self.display_id is None:
            prefix = self._get_display_id_prefix()
            self.display_id = self.generate_display_id(prefix)
        super().save(*args, **kwargs)


class AbstractEntity(BrowsableItem):
    """Abstract base for entity-like models across all mods.

    Extends :class:`BrowsableItem` with the common fields every entity
    needs — name, author, status, folder, schema, properties — so mods
    don't duplicate them.

    Subclasses **must** override ``_get_display_id_prefix()``.  The default
    implementation reads from ``self.schema.prefix``.
    """

    name = models.CharField(max_length=500)
    author = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="+",
    )
    last_editor = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ("in_progress", "In Progress"),
            ("finished", "Finished"),
        ],
        default="in_progress",
    )
    folder = models.ForeignKey(
        "core.Folder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    project = models.ForeignKey(
        "core.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="Placeholder FK — the Project model is not yet implemented.",
    )
    schema = models.ForeignKey(
        "helix_core.Schema",
        on_delete=models.PROTECT,
        related_name="+",
    )
    properties = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def _get_display_id_prefix(self) -> str:
        """Read the display-ID prefix from the linked Schema."""
        return self.schema.prefix
