"""Shared domain models for helix_core.

SchemaType and Schema provide the foundation for mods to declare their
schema identity at boot — replacing the LIMS-owned EntityType /
RegisteredEntityType split with shared models usable by any mod.
"""

import hashlib
import json
import uuid

from django.db import models


# ── Shared column-ID + content-hash pipeline ──────────────────────────────


class ContentHashedModel(models.Model):
    """Abstract mixin for models that carry a ``columns`` JSONField with
    auto-generated column UUIDs and a SHA-256 ``content_hash``.

    Provides:
    * ``ensure_column_ids(columns)`` — static helper that assigns stable
      UUIDs to any column dict missing an ``id`` key.
    * ``compute_content_hash(columns)`` — SHA-256 of the canonicalised
      column definitions (only hashes the fields in ``_HASH_FIELDS``).
    * ``save()`` — ensures column IDs are present and the content hash
      is up-to-date before every write.

    Subclasses must define a ``columns`` JSONField and a ``content_hash``
    CharField.  Override ``_HASH_FIELDS`` to customise which column keys
    are included in the hash.
    """

    _HASH_FIELDS = ("id", "name", "type", "required", "default", "units", "dropdownId")

    class Meta:
        abstract = True

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

    def save(self, *args, **kwargs):
        """Ensure every column has an id and the content hash is up-to-date."""
        if self.columns:
            self.ensure_column_ids(self.columns)
        self.content_hash = self.compute_content_hash(self.columns or [])
        super().save(*args, **kwargs)


# ── SchemaType ────────────────────────────────────────────────────────────


class SchemaType(ContentHashedModel):
    """A type of schema owned by a workspace/mod.

    Each mod registers one SchemaType (e.g. ``"lims.entity"``) that
    describes what kind of entities it manages.  A SchemaType has one
    or more Schemas underneath it.

    Inherits column-ID generation and content-hash pipeline from
    :class:`ContentHashedModel`.
    """

    display_name = models.CharField(max_length=255)
    workspace_id = models.CharField(max_length=100)
    model = models.CharField(
        max_length=500,
        help_text="Dotted Python path to the model class, e.g. 'mods.lims.models.Entity'.",
    )
    columns = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered array of column definitions: {id, name, type, required, default, units, description}.",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Soft-delete flag. Inactive schema types are hidden from dropdowns.",
    )
    content_hash = models.CharField(
        max_length=64,
        default="",
        blank=True,
        help_text="SHA-256 hash of column definitions (id, name, type, required, default, units). Computed on every save.",
    )

    class Meta:
        db_table = "helix_schema_type"
        ordering = ["display_name"]

    def __str__(self):
        return f"{self.display_name} ({self.workspace_id})"


# ── Schema ────────────────────────────────────────────────────────────────


class Schema(ContentHashedModel):
    """A concrete schema within a SchemaType.

    Every SchemaType gets at least one default Schema on registration.
    Mods can define additional schemas (e.g. "default DNA schema",
    "clinical DNA schema") that share the same SchemaType.

    Inherits column-ID generation and content-hash pipeline from
    :class:`ContentHashedModel`.
    """

    name = models.CharField(max_length=255)
    prefix = models.CharField(
        max_length=50,
        unique=True,
        help_text="Uppercase letters, e.g. BLOOD. Used to generate display IDs like BLOOD1.",
    )
    schema_type = models.ForeignKey(
        SchemaType,
        on_delete=models.CASCADE,
        related_name="schemas",
    )
    columns = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered array of column definitions.",
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Whether this is the default schema for its SchemaType.",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Soft-delete flag. Inactive schemas are hidden from dropdowns.",
    )
    content_hash = models.CharField(
        max_length=64,
        default="",
        blank=True,
        help_text="SHA-256 hash of column definitions.",
    )

    class Meta:
        db_table = "helix_schema"
        ordering = ["schema_type", "name"]

    def __str__(self):
        return f"{self.name} [{self.prefix}]"


# ── Entity Hub View (unmanaged — backed by PostgreSQL VIEW) ──────────────


class EntityHubView(models.Model):
    """Unmanaged model mapping to the ``entity_hub_view`` PostgreSQL VIEW.

    Provides a read-only UNION ALL across all AbstractEntity tables
    (eln_entry, lims_entity, and any future entity tables).  Each row
    includes ``schema_type_id`` and ``workspace_id`` computed columns
    populated by the VIEW definition.

    Used by the Entities Hub API endpoint to list all entities across
    the system in a single paginated response.
    """

    name = models.CharField(max_length=500)
    display_id = models.CharField(max_length=50)
    author = models.ForeignKey(
        "core.User",
        on_delete=models.DO_NOTHING,
        related_name="+",
        db_column="author_id",
    )
    last_editor = models.ForeignKey(
        "core.User",
        on_delete=models.DO_NOTHING,
        null=True,
        related_name="+",
        db_column="last_editor_id",
    )
    status = models.CharField(max_length=100)
    folder = models.ForeignKey(
        "core.Folder",
        on_delete=models.DO_NOTHING,
        null=True,
        related_name="+",
        db_column="folder_id",
    )
    project = models.ForeignKey(
        "core.Project",
        on_delete=models.DO_NOTHING,
        null=True,
        related_name="+",
        db_column="project_id",
    )
    schema = models.ForeignKey(
        Schema,
        on_delete=models.DO_NOTHING,
        related_name="+",
        db_column="schema_id",
    )
    properties = models.JSONField(default=dict)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    # Computed columns from the VIEW's UNION ALL branches
    schema_type_id = models.CharField(max_length=50)
    workspace_id = models.CharField(max_length=50)

    class Meta:
        managed = False
        db_table = "entity_hub_view"
        ordering = ["-updated_at"]


# ── Color Token ─────────────────────────────────────────────────────────


class ColorToken(models.Model):
    """A named color in the platform palette.

    Each ColorToken has a unique ``key`` (string identifier used by
    referencing objects like tags and schemas), a human-readable
    ``label``, and a ``hex`` color value.  Foreground / glyph colour
    is derived from the hex by luminance at render time — never stored.
    """

    key = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=255)
    hex = models.CharField(max_length=7)

    class Meta:
        db_table = "helix_color_token"
        ordering = ["label"]

    def __str__(self):
        return f"{self.label} ({self.key})"
