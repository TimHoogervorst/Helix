"""Abstract base classes shared across apps.

BrowsableItem provides the auto-generated display_id and created_at
fields used by any model that appears in the console Master Panel
(NotebookEntry, Entity, etc.).
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
            num = int(last[len(prefix) :])
        else:
            num = 0
        return f"{prefix}{num + 1}"

    def save(self, *args, **kwargs):
        if self.display_id is None:
            prefix = self._get_display_id_prefix()
            self.display_id = self.generate_display_id(prefix)
        super().save(*args, **kwargs)
