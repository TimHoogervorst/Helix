import hashlib
import json
import uuid

from django.contrib.contenttypes.models import ContentType
from django.db import models

from helix_core.abstracts import BrowsableItem
from helix_core.actions.base import AbstractBaseAction
from core.constants import STATUS_CHOICES


class EntityType(models.Model):
    """A type/category of LIMS entity (e.g., DNA, Chemical, Buffer).

    Carries a prefix for entity display_id generation and a JSON schema
    (``columns``) that defines the properties entities of this type can have.
    """

    name = models.CharField(max_length=255, unique=True)
    prefix = models.CharField(
        max_length=20,
        unique=True,
        help_text="Uppercase letters, e.g. BLOOD. Used to generate display IDs like BLOOD1.",
    )
    columns = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered array of column definitions: {id, name, type, required, default, units, description}.",
    )
    icon = models.CharField(
        max_length=10,
        default="🧪",
        help_text="Single emoji used as the icon for this entity type in reference badges.",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Soft-delete flag. Inactive schemas are hidden from dropdowns but preserve existing entities.",
    )
    content_hash = models.CharField(
        max_length=64,
        default="",
        blank=True,
        help_text="SHA-256 hash of column definitions (id, name, type, required, default, units). Computed on every save.",
    )

    class Meta:
        db_table = "lims_entity_type"
        ordering = ["name"]

    def __str__(self):
        return self.name

    # ── Column ID helpers ───────────────────────────────────────────────

    @staticmethod
    def ensure_column_ids(columns):
        """Assign a stable UUID to each column that doesn't already have one.

        Mutates the column dicts in-place.  Existing columns with a truthy
        ``id`` keep it; new columns receive a fresh ``uuid.uuid4()`` string.
        """
        for col in columns:
            if not col.get("id"):
                col["id"] = str(uuid.uuid4())
        return columns

    # ── Content hash ────────────────────────────────────────────────────

    _HASH_FIELDS = ("id", "name", "type", "required", "default", "units")

    @classmethod
    def compute_content_hash(cls, columns):
        """SHA-256 of the canonicalised column definitions.

        Only the fields in ``_HASH_FIELDS`` are included so that metadata
        (e.g. ``description``) can change without invalidating the hash.
        """
        hash_data = [
            {f: col.get(f, "" if f != "required" else False) for f in cls._HASH_FIELDS}
            for col in (columns or [])
        ]
        canonical = json.dumps(hash_data, sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()

    # ── Save hook ───────────────────────────────────────────────────────

    def save(self, *args, **kwargs):
        """Ensure every column has an id and the content hash is up-to-date."""
        if self.columns:
            self.ensure_column_ids(self.columns)
        self.content_hash = self.compute_content_hash(self.columns or [])
        super().save(*args, **kwargs)


class RegisteredEntityType(models.Model):
    """Maps a display-ID prefix to its owning workspace and content type.

    This is the backend mirror of the frontend's ``RegisteredEntityType``
    interface in ``core/mod-system/types.ts``.  Together with the
    ``registerEntityType`` service, it makes LIMS the central registry for
    all mentionable entity types.

    Every entity type that can appear in a mention (``#DNA34``, ``#E1``) must
    have a row here.  The resolve and search endpoints JOIN through this table
    to determine ``workspaceId``, which the frontend uses to build navigation
    URLs by convention: ``/{workspaceId}/{displayId}``.

    Design: ADR-0006.
    """

    prefix = models.CharField(
        max_length=20,
        unique=True,
        help_text="Uppercase letters extracted from display IDs, e.g. 'E', 'DNA'. Must be unique across all entity types.",
    )
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        help_text="The Django model that backs entities with this prefix.",
    )
    workspace_id = models.CharField(
        max_length=100,
        help_text="The workspace that owns this entity type. Used as the URL namespace: /{workspaceId}/{displayId}.",
    )
    display_name = models.CharField(
        max_length=255,
        help_text="Human-readable name shown in search results, e.g. 'Entry', 'DNA Sequence'.",
    )

    class Meta:
        db_table = "lims_registered_entity_type"
        ordering = ["prefix"]

    def __str__(self):
        return f"{self.prefix} → {self.display_name} ({self.workspace_id})"


class Entity(BrowsableItem):
    """A structured LIMS entity representing a physical sample or item.

    display_id is auto-generated from the EntityType prefix on first save
    (same pattern as NotebookEntry.display_id).
    """

    name = models.CharField(max_length=500)
    entity_type = models.ForeignKey(
        EntityType, on_delete=models.CASCADE, related_name="entities"
    )
    properties = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="in_progress",
    )
    source_entry = models.ForeignKey(
        "eln.NotebookEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lims_entities",
    )
    folder = models.ForeignKey(
        "core.Folder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="entities",
    )
    created_by = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="entities",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "lims_entity"
        ordering = ["-created_at"]
        verbose_name_plural = "entities"

    def __str__(self):
        if self.display_id:
            return f"{self.display_id} — {self.name}"
        return f"{self.name} ({self.entity_type.name})"

    def _get_display_id_prefix(self) -> str:
        return self.entity_type.prefix


class Action(AbstractBaseAction):
    """A recorded action performed on an entity.

    Extends :class:`AbstractBaseAction` to add LIMS-specific fields
    (``entity``, ``source_entry``) while inheriting the shared action
    columns (``performed_by``, ``action_type``, ``target_type``,
    ``target_id``, ``metadata``, ``created_at``).
    """

    ACTION_CHOICES = [
        ("created", "Created"),
        ("used", "Used"),
        ("measured", "Measured"),
        ("noted", "Noted"),
        ("transferred", "Transferred"),
        ("aliquoted", "Aliquoted"),
    ]

    entity = models.ForeignKey(Entity, on_delete=models.CASCADE, related_name="actions")
    source_entry = models.ForeignKey(
        "eln.NotebookEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="actions",
    )

    class Meta:
        db_table = "lims_action"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action_type} on {self.entity.name}"
