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

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Length


class Sourceable(models.Model):
    """Shared polymorphic placement fields for project-owned items."""

    source_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name="+",
    )
    source_id = models.PositiveIntegerField()
    source = GenericForeignKey("source_type", "source_id")
    source_path = models.JSONField(default=list, blank=True)

    class Meta:
        abstract = True

    def _source_project_id(self, source):
        from core.models import Folder, Project
        from mods.eln.models import NotebookEntry
        from mods.lims.models import Entity

        if isinstance(source, Project):
            return source.pk
        if not isinstance(source, (Folder, NotebookEntry, Entity)):
            raise ValidationError({"source": "Source type is not supported."})
        return source.project_id

    def _source_kind(self, source):
        return {
            "project": "project",
            "folder": "folder",
            "notebookentry": "entry",
            "entity": "entity",
        }.get(source.__class__.__name__.lower(), source.__class__.__name__.lower())

    def _default_source(self):
        from core.models import Project

        if self.__class__.__name__ == "Folder":
            return self.parent if self.parent_id else self.project
        legacy_entry_id = getattr(self, "source_entry_id", None)
        if legacy_entry_id:
            from mods.eln.models import NotebookEntry

            return NotebookEntry.objects.get(pk=legacy_entry_id)
        return self.folder if self.folder_id else self.project

    def _validate_source(self, source):
        from core.models import Folder, Project
        from mods.eln.models import NotebookEntry
        from mods.lims.models import Entity

        if source is None:
            raise ValidationError({"source": "Source is required."})
        if not isinstance(source, (Project, Folder, NotebookEntry, Entity)):
            raise ValidationError({"source": "Source type is not supported."})
        if source is self or (
            source.__class__ is self.__class__ and source.pk == self.pk
        ):
            raise ValidationError({"source": "An item cannot source itself."})
        if isinstance(self, Folder) and not isinstance(source, (Folder, Project)):
            raise ValidationError({"source": "Folders may only source from a Folder or Project."})
        if self.project_id != self._source_project_id(source):
            raise ValidationError({"source": "Source must belong to the same Project."})

        seen = set()
        node = source
        while not isinstance(node, Project):
            marker = (node.__class__, node.pk)
            if marker in seen:
                raise ValidationError({"source": "Source cycles are not allowed."})
            seen.add(marker)
            node = getattr(node, "source", None)
            if node is None:
                raise ValidationError({"source": "Source chain is incomplete."})

    def _set_source_path(self, source):
        from core.models import Project

        if isinstance(source, Project):
            return [{"kind": "project", "id": source.pk}]
        path = list(source.source_path or [])
        if not path:
            path = self._set_source_path(source.source)
        return path + [{"kind": self._source_kind(source), "id": source.pk}]

    def save(self, *args, **kwargs):
        if self.source_type_id is None or self.source_id is None:
            source = self._default_source()
            self.source_type = ContentType.objects.get_for_model(source)
            self.source_id = source.pk
        source = self.source
        if self.project_id is None:
            self.project_id = self._source_project_id(source)
        self._validate_source(source)
        self.source_path = self._set_source_path(source)
        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {
                "source_type", "source_id", "source_path"
            }
        super().save(*args, **kwargs)


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


class AbstractEntity(Sourceable, BrowsableItem):
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
        max_length=100,
        default="in_progress",
        help_text="Status value from the dropdowns system. The canonical list of "
                  "valid statuses is stored in the Status dropdown (managed in "
                  "Settings → Dropdowns).",
    )
    folder = models.ForeignKey(
        "core.Folder",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="+",
    )
    project = models.ForeignKey(
        "core.Project",
        on_delete=models.CASCADE,
        related_name="+",
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

    def save(self, *args, **kwargs):
        if self.project_id is None and self.folder_id is not None:
            self.project = self.folder.project
        super().save(*args, **kwargs)

    def _get_display_id_prefix(self) -> str:
        """Read the display-ID prefix from the linked Schema."""
        return self.schema.prefix
