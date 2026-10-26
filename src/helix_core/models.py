"""Shared domain models for helix_core.

SchemaType and Schema provide the foundation for mods to declare their
schema identity at boot — replacing the LIMS-owned EntityType /
RegisteredEntityType split with shared models usable by any mod.
"""

import hashlib
import json
import uuid

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone
from helix_core.abstracts import AbstractEntity


def user_attribution_snapshot(user):
    """Capture the stable display identity used after an account is removed."""
    if user is None:
        return {}
    display_name = user.get_full_name().strip() or user.username
    return {
        "id": str(user.pk),
        "username": user.username,
        "displayName": display_name,
    }


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

    _HASH_FIELDS = (
        "id",
        "name",
        "type",
        "required",
        "default",
        "units",
        "dropdownId",
        "referenceSchemaId",
        "referenceSchemaTypeId",
        "expression",
        "resultType",
        "expression_version",
    )

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

    def columns_for_hash(self):
        """Return the column definitions represented by this model."""
        return self.columns

    def save(self, *args, **kwargs):
        """Ensure every column has an id and the content hash is up-to-date."""
        if self.columns:
            self.ensure_column_ids(self.columns)
            previous_columns = {}
            has_formula_columns = any(
                column.get("type") == "formula" for column in self.columns
            )
            if self.pk and has_formula_columns:
                previous = type(self).objects.filter(pk=self.pk).values_list("columns", flat=True).first()
                previous_columns = {
                    column.get("id"): column
                    for column in (previous or [])
                    if column.get("id")
                }
            for column in self.columns:
                if column.get("type") != "formula":
                    continue
                old = previous_columns.get(column.get("id"))
                if old is None:
                    column["expression_version"] = column.get("expression_version", 1)
                elif old.get("expression") != column.get("expression"):
                    column["expression_version"] = old.get("expression_version", 1) + 1
                else:
                    column["expression_version"] = old.get(
                        "expression_version", column.get("expression_version", 1)
                    )
        self.content_hash = self.compute_content_hash(self.columns_for_hash() or [])
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
    identity = models.CharField(
        max_length=150,
        blank=True,
        default="",
        help_text="Canonical Schema Type reference, e.g. 'helix.lims:entity'.",
    )
    model = models.CharField(
        max_length=500,
        help_text="Dotted Python path to the model class, e.g. 'bundled.lims.models.Entity'.",
    )
    columns = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered array of column definitions: {id, name, type, required, default, units, description}.",
    )
    capabilities = models.JSONField(
        default=list,
        blank=True,
        help_text="Capabilities declared by the owning mod.",
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
    icon = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Open key string referencing an IconLibraryEntry key. Soft reference with render-time fallback.",
    )
    color = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Open key string referencing a ColorToken key. Soft reference with render-time fallback.",
    )
    enabled_components = models.JSONField(
        default=list,
        blank=True,
        help_text="IDs of enabled frontend Schema Components.",
    )

    class Meta:
        db_table = "helix_schema"
        ordering = ["schema_type", "name"]

    def __str__(self):
        return f"{self.name} [{self.prefix}]"

    def columns_for_hash(self):
        """Hash type-level and schema-level definitions as one schema."""
        return [*(self.schema_type.columns or []), *(self.columns or [])]


# ── Platform-owned Action records ─────────────────────────────────────────


class ActionDefinition(models.Model):
    """Platform-owned declaration of an action a Mod can initiate."""

    identity = models.CharField(max_length=255, unique=True)
    label = models.CharField(max_length=255)
    core_action = models.CharField(max_length=16)
    target_model_reference = models.CharField(max_length=255)
    provider_mod_id = models.CharField(max_length=255)
    provider_mod_version = models.CharField(max_length=64)

    class Meta:
        db_table = "helix_action_definition"
        ordering = ["identity"]


class ActionLogEntry(models.Model):
    """The single durable, Mod-independent Action Log Entry store."""

    performed_by = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="action_log_entries",
    )
    performed_by_snapshot = models.JSONField(default=dict, blank=True)
    action = models.CharField(max_length=255)
    action_type = models.CharField(max_length=16)
    target_model_reference = models.CharField(max_length=255)
    target_object_id = models.CharField(max_length=255)
    target_version_reference = models.CharField(max_length=255, null=True, blank=True)
    target_version_object_id = models.CharField(max_length=255, null=True, blank=True)
    target_version_label = models.CharField(max_length=255, null=True, blank=True)
    target_version_hash = models.CharField(max_length=128, null=True, blank=True)
    initiating_mod_id = models.CharField(max_length=255, default="unknown")
    initiating_mod_version = models.CharField(max_length=64, default="unknown")
    request_id = models.UUIDField(null=True, blank=True)
    client_ip = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    legacy_table = models.CharField(max_length=255, null=True, blank=True)
    legacy_id = models.PositiveBigIntegerField(null=True, blank=True)

    class Meta:
        db_table = "helix_action_log_entry"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["target_model_reference", "target_object_id"], name="helix_action_target_75f3c0_idx"),
            models.Index(fields=["action", "created_at"], name="helix_action_action_0d1d0d_idx"),
            models.Index(fields=["initiating_mod_id", "created_at"], name="helix_action_initia_4b48a1_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["legacy_table", "legacy_id"],
                name="helix_action_legacy_source_uniq",
            ),
        ]

    def save(self, *args, **kwargs):
        """Keep the audit ledger append-only after its initial insert."""
        if self.pk is not None:
            raise ValueError("ActionLogEntry is append-only")
        if self.performed_by_id and not self.performed_by_snapshot:
            self.performed_by_snapshot = user_attribution_snapshot(self.performed_by)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("ActionLogEntry is append-only")

    @property
    def target_type(self):
        return self.target_model_reference

    @property
    def target_id(self):
        try:
            return int(self.target_object_id)
        except (TypeError, ValueError):
            return self.target_object_id


class PlatformRecord(AbstractEntity):
    """Platform-owned scientific record independent of any Mod model."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    field_values = models.JSONField(default=dict, blank=True)
    state_token = models.UUIDField(default=uuid.uuid4, editable=False)
    author = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    author_snapshot = models.JSONField(default=dict, blank=True)
    last_editor_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "helix_platform_record"
        ordering = ["-created_at"]

    def _get_display_id_prefix(self):
        return self.schema.prefix

    def save(self, *args, **kwargs):
        if self.author_id and not self.author_snapshot:
            self.author_snapshot = user_attribution_snapshot(self.author)
        if self.last_editor_id:
            self.last_editor_snapshot = user_attribution_snapshot(self.last_editor)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        from helix_core.record_persistence import delete_platform_record

        return delete_platform_record(self, actor=None)


class RecordRevisionGroup(models.Model):
    """Stable identity and current pointer for a record's immutable field snapshot."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    record = models.ForeignKey(
        PlatformRecord, on_delete=models.SET_NULL, related_name="revision_groups",
        null=True, blank=True,
    )
    target_model_reference = models.CharField(max_length=255, blank=True, default="")
    target_object_id = models.CharField(max_length=255, blank=True, default="")
    group_key = models.CharField(max_length=100, default="record")
    # Canonical Mod ownership is distinct from the historical target strings.
    # Blank values are retained for legacy groups whose owner cannot be
    # established from an active registration.
    owner_mod_id = models.CharField(max_length=255, blank=True, default="")
    current_revision = models.ForeignKey(
        "ScientificRevision", on_delete=models.PROTECT, null=True, blank=True,
        related_name="current_for_groups",
    )

    class Meta:
        db_table = "helix_record_revision_group"
        constraints = [
            models.UniqueConstraint(
                fields=("target_model_reference", "target_object_id", "group_key"),
                name="helix_record_revision_target_group_uniq",
            )
        ]


class ScientificRevision(models.Model):
    """Immutable full snapshot of a record Revision Group."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(
        RecordRevisionGroup, on_delete=models.CASCADE, related_name="revisions"
    )
    sequence = models.PositiveIntegerField()
    snapshot = models.JSONField()
    content_hash = models.CharField(max_length=64)
    created_by = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="scientific_revisions",
    )
    created_by_snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "helix_scientific_revision"
        ordering = ["sequence"]
        constraints = [
            models.UniqueConstraint(fields=("group", "sequence"), name="helix_revision_group_sequence_uniq")
        ]

    def save(self, *args, **kwargs):
        if self.pk is not None and type(self).objects.filter(pk=self.pk).exists():
            raise ValueError("ScientificRevision is immutable")
        if self.created_by_id and not self.created_by_snapshot:
            self.created_by_snapshot = user_attribution_snapshot(self.created_by)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("ScientificRevision is immutable")


class PlatformAttachment(models.Model):
    """Immutable Platform-managed upload, staged before a scientific save."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("core.Project", on_delete=models.PROTECT, related_name="platform_attachments")
    created_by = models.ForeignKey("core.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    storage_key = models.CharField(max_length=500, unique=True)
    filename = models.CharField(max_length=255)
    media_type = models.CharField(max_length=255, blank=True, default="application/octet-stream")
    size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=(("staged", "Staged"), ("complete", "Complete")), default="staged")
    created_at = models.DateTimeField(default=timezone.now)
    unreferenced_at = models.DateTimeField(default=timezone.now, null=True, blank=True)

    class Meta:
        db_table = "helix_platform_attachment"
        indexes = [models.Index(fields=("status", "created_at"), name="helix_attach_stage_idx")]

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            old = type(self).objects.get(pk=self.pk)
            immutable = ("project_id", "storage_key", "filename", "media_type", "size", "sha256", "created_by_id", "created_at")
            if any(getattr(old, field) != getattr(self, field) for field in immutable):
                raise ValueError("PlatformAttachment metadata is immutable")
            if old.status == "complete" and self.status != "complete":
                raise ValueError("A completed PlatformAttachment cannot be unstaged")
        return super().save(*args, **kwargs)


class AttachmentRevisionLink(models.Model):
    """An immutable attachment reference retained by one exact Revision."""

    revision = models.ForeignKey(ScientificRevision, on_delete=models.CASCADE, related_name="attachment_links")
    attachment = models.ForeignKey(PlatformAttachment, on_delete=models.PROTECT, related_name="revision_links")

    class Meta:
        db_table = "helix_attachment_revision_link"
        constraints = [models.UniqueConstraint(fields=("revision", "attachment"), name="helix_attachment_revision_uniq")]


class PlatformRendition(models.Model):
    """Platform-owned immutable presentation artifact for an exact Revision."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    record = models.ForeignKey(PlatformRecord, on_delete=models.CASCADE, related_name="renditions")
    group = models.ForeignKey(RecordRevisionGroup, on_delete=models.CASCADE, related_name="renditions")
    revision = models.ForeignKey(ScientificRevision, on_delete=models.CASCADE, related_name="renditions")
    attachment = models.ForeignKey(PlatformAttachment, on_delete=models.PROTECT, related_name="renditions")
    source_hash = models.CharField(max_length=64)
    captured_by = models.ForeignKey("core.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    captured_by_snapshot = models.JSONField(default=dict, blank=True)
    captured_at = models.DateTimeField(default=timezone.now)
    presentation_provider = models.CharField(max_length=255)
    presentation_version = models.CharField(max_length=100)
    presentation_context = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "helix_platform_rendition"
        ordering = ("-captured_at", "id")

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValueError("PlatformRendition metadata is immutable")
        if self.captured_by_id and not self.captured_by_snapshot:
            self.captured_by_snapshot = user_attribution_snapshot(self.captured_by)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("PlatformRendition is immutable")


class ReviewTarget(models.Model):
    """Platform-owned lifecycle and persistent lock for one reviewed record."""

    class State(models.TextChoices):
        AUTHORING = "authoring", "Authoring"
        SUBMITTED = "submitted", "Submitted"
        FINISHED = "finished", "Finished"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    record = models.OneToOneField(
        PlatformRecord, on_delete=models.CASCADE, related_name="review_target",
    )
    provider_mod_id = models.CharField(max_length=255)
    registration_id = models.CharField(max_length=255, default="")
    state = models.CharField(max_length=16, choices=State.choices, default=State.AUTHORING)
    current_submission = models.ForeignKey(
        "ReviewSubmission", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="current_for_targets",
    )
    creator_snapshot = models.JSONField(default=dict, blank=True)
    contributor_history_complete = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "helix_review_target"

    @property
    def locked(self):
        return self.state in {self.State.SUBMITTED, self.State.FINISHED}


class ReviewContributor(models.Model):
    """Durable attribution for a user who created or changed reviewed content."""

    target = models.ForeignKey(ReviewTarget, on_delete=models.CASCADE, related_name="contributors")
    actor_stable_id = models.CharField(max_length=255)
    actor = models.ForeignKey("core.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actor_snapshot = models.JSONField(default=dict, blank=True)
    first_effect = models.CharField(max_length=100)
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "helix_review_contributor"
        constraints = [models.UniqueConstraint(fields=("target", "actor_stable_id"), name="helix_review_contributor_actor_uniq")]


class ReviewSubmission(models.Model):
    """Immutable exact multi-group manifest for one submitted review round."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    target = models.ForeignKey(ReviewTarget, on_delete=models.CASCADE, related_name="submissions")
    round_number = models.PositiveIntegerField()
    manifest = models.JSONField()
    captured_evidence = models.JSONField(default=dict, blank=True)
    rendition = models.ForeignKey(
        PlatformRendition, on_delete=models.CASCADE, null=True, blank=True,
        related_name="review_submissions",
    )
    submitted_by = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    submitted_by_snapshot = models.JSONField(default=dict, blank=True)
    submitted_at = models.DateTimeField(default=timezone.now)
    request_id = models.UUIDField()
    request_fingerprint = models.CharField(max_length=64)
    withdrawn_by_snapshot = models.JSONField(default=dict, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    withdraw_actor_stable_id = models.CharField(max_length=255, blank=True, default="")
    withdraw_request_id = models.UUIDField(null=True, blank=True)
    withdraw_request_fingerprint = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        db_table = "helix_review_submission"
        constraints = [
            models.UniqueConstraint(fields=("target", "round_number"), name="helix_review_submission_round_uniq"),
            models.UniqueConstraint(fields=("submitted_by", "request_id"), name="helix_review_submission_actor_request_uniq"),
        ]
        ordering = ("target", "round_number")

    def save(self, *args, **kwargs):
        if self.pk is not None and type(self).objects.filter(pk=self.pk).exists():
            old = type(self).objects.get(pk=self.pk)
            immutable = (
                "target_id", "round_number", "manifest", "captured_evidence",
                "rendition_id", "submitted_by_id", "submitted_by_snapshot", "submitted_at",
                "request_id", "request_fingerprint",
            )
            if any(getattr(old, name) != getattr(self, name) for name in immutable):
                raise ValueError("ReviewSubmission evidence and identity are immutable")
        if self.submitted_by_id and not self.submitted_by_snapshot:
            self.submitted_by_snapshot = user_attribution_snapshot(self.submitted_by)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("ReviewSubmission is immutable")


@receiver(post_delete, sender=AttachmentRevisionLink)
def mark_attachment_unreferenced(sender, instance, **kwargs):
    attachment = instance.attachment
    if not attachment.revision_links.exists():
        PlatformAttachment.objects.filter(pk=attachment.pk).update(unreferenced_at=timezone.now())


class ActionParticipant(models.Model):
    """A record's explicit role in one authoritative Platform Action."""

    action = models.ForeignKey(
        ActionLogEntry, on_delete=models.PROTECT, related_name="participants"
    )
    record = models.ForeignKey(
        PlatformRecord, on_delete=models.SET_NULL, related_name="action_participations",
        null=True, blank=True,
    )
    target_model_reference = models.CharField(max_length=255, blank=True, default="")
    target_object_id = models.CharField(max_length=255, blank=True, default="")
    role = models.CharField(max_length=100)

    class Meta:
        db_table = "helix_action_participant"
        constraints = [
            models.UniqueConstraint(
                fields=("action", "target_model_reference", "target_object_id", "role"),
                name="helix_action_participant_role_uniq",
            )
        ]


class ActionExecutionReceipt(models.Model):
    """Actor-scoped saved result for retrying a completed record mutation."""

    actor = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="record_action_receipts"
    )
    request_id = models.UUIDField()
    request_hash = models.CharField(max_length=64)
    response = models.JSONField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "helix_action_execution_receipt"
        constraints = [
            models.UniqueConstraint(fields=("actor", "request_id"), name="helix_action_receipt_actor_request_uniq")
        ]


class ActionInvocationReceipt(models.Model):
    """Durable actor-scoped outcome for replaying a completed Action invocation."""

    actor = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="action_invocation_receipts",
    )
    # User primary keys are database-assigned and never reused. Keep this
    # immutable scope after account deletion so an invocation ID cannot be
    # claimed again and its audit receipt remains available.
    actor_stable_id = models.CharField(max_length=255)
    invocation_id = models.CharField(max_length=255)
    fingerprint = models.CharField(max_length=64)
    request_fingerprint = models.CharField(max_length=64)
    target_ids = models.JSONField(default=dict)
    outcome = models.JSONField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "helix_action_invocation_receipt"
        constraints = [
            models.UniqueConstraint(
                fields=("actor_stable_id", "invocation_id"),
                name="helix_action_invocation_actor_id_uniq",
            )
        ]


# ── Entity Hub View (unmanaged — backed by PostgreSQL VIEW) ──────────────


class EntityHubView(models.Model):
    """Unmanaged model mapping to the ``entity_hub_view`` PostgreSQL VIEW.

    Provides a read-only UNION ALL across all AbstractEntity tables
    (provider-owned, LIMS, and any future entity tables).  Each row
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
        null=True,
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
        null=True,
        related_name="+",
        db_column="schema_id",
    )
    properties = models.JSONField(default=dict)
    source_type = models.ForeignKey(
        ContentType,
        on_delete=models.DO_NOTHING,
        db_column="source_type_id",
        related_name="+",
    )
    source_id = models.PositiveIntegerField()
    source = GenericForeignKey("source_type", "source_id")
    source_path = models.JSONField(default=list)
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
    ``label``, and a ``hex`` color value.

    ``hex_dark`` and ``hex_light`` are automatically derived from
    ``hex`` on every save.  When the active theme is dark the UI uses
    ``hex_dark``; when light it uses ``hex_light``.
    """

    key = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=255)
    hex = models.CharField(max_length=7)
    hex_dark = models.CharField(max_length=7)
    hex_light = models.CharField(max_length=7)

    class Meta:
        db_table = "helix_color_token"
        ordering = ["label"]

    def __str__(self):
        return f"{self.label} ({self.key})"

    def save(self, *args, **kwargs):
        self.hex_dark, self.hex_light = _derive_variants(self.hex)
        super().save(*args, **kwargs)


def _derive_variants(hex_color: str) -> tuple[str, str]:
    """Derive dark-theme and light-theme hex variants.

    ``hex_dark`` darkens the colour for depth on dark backgrounds
    (except for very dark colours, which get a tiny lift so they
    remain visible).  Saturation is boosted for vibrancy.

    ``hex_light`` is the original colour (assumed to have been
    chosen for light-background contexts).
    """
    import colorsys

    hex_color = hex_color.lstrip("#")
    if len(hex_color) not in (3, 6):
        return hex_color, hex_color

    if len(hex_color) == 3:
        hex_color = "".join(c * 2 for c in hex_color)

    r = int(hex_color[0:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0

    h, l, s = colorsys.rgb_to_hls(r, g, b)

    if l < 0.30:
        l_dark = l * 1.1
    else:
        l_dark = l * 0.82

    s_dark = min(1.0, s * 1.3)
    rd, gd, bd = colorsys.hls_to_rgb(h, l_dark, s_dark)
    hex_dark = "#{:02X}{:02X}{:02X}".format(
        round(rd * 255), round(gd * 255), round(bd * 255)
    )

    hex_light = "#{:02X}{:02X}{:02X}".format(
        round(r * 255), round(g * 255), round(b * 255)
    )

    return hex_dark, hex_light


# ── Icon Library Entry ─────────────────────────────────────────────────


class IconLibraryEntry(models.Model):
    """A curated icon available in the platform icon picker.

    Each entry has a unique ``key`` used by referencing objects
    (tags, cards, schemas).  ``kind`` is either ``"lucide"`` (a
    Lucide icon reference with a kebab-case ``token``) or
    ``"custom"`` (an uploaded SVG stored as sanitized markup in
    ``svg``).
    """

    K_LUCIDE = "lucide"
    K_CUSTOM = "custom"
    KIND_CHOICES = [
        (K_LUCIDE, "Lucide"),
        (K_CUSTOM, "Custom"),
    ]

    key = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=255)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    token = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Lucide kebab-case icon name (e.g. 'test-tube-2'). Only when kind=lucide.",
    )
    svg = models.TextField(
        blank=True,
        default="",
        help_text="Sanitized SVG markup. Only when kind=custom.",
    )

    class Meta:
        db_table = "helix_icon_library_entry"
        ordering = ["label"]

    def __str__(self):
        return f"{self.label} ({self.key})"


class ModInstallation(models.Model):
    """Durable installation and activation state for a discovered Mod."""

    class State(models.TextChoices):
        INSTALLED = "installed", "Installed"
        INACTIVE = "inactive", "Inactive"
        ACTIVE = "active", "Active"
        REMOVED = "removed", "Removed"

    class DesiredState(models.TextChoices):
        INACTIVE = "inactive", "Inactive"
        ACTIVE = "active", "Active"

    mod_id = models.CharField(max_length=255, unique=True)
    display_name = models.CharField(max_length=255)
    version = models.CharField(max_length=64)
    requires_helix = models.CharField(max_length=255)
    artifacts = models.JSONField(default=list)
    dependencies = models.JSONField(default=list)
    tier = models.CharField(max_length=20)
    locator = models.CharField(max_length=500, blank=True, default="")
    state = models.CharField(max_length=20, choices=State.choices)
    desired_state = models.CharField(
        max_length=20,
        choices=DesiredState.choices,
        default=DesiredState.INACTIVE,
    )
    manifest = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "helix_mod_installation"
        ordering = ["mod_id"]


class RetainedContract(models.Model):
    """Immutable meaning retained independently from an executable Mod."""

    kind = models.CharField(max_length=16)
    contract_id = models.CharField(max_length=255)
    version = models.CharField(max_length=64)
    fingerprint = models.CharField(max_length=64)
    canonical_envelope = models.TextField()

    class Meta:
        db_table = "helix_retained_contract"
        constraints = [
            models.UniqueConstraint(
                fields=("kind", "contract_id", "version"),
                name="helix_contract_exact_identity",
            )
        ]
        ordering = ["kind", "contract_id", "version"]


class ContractRetentionLock(models.Model):
    """Singleton row serializing even initially empty retention batches."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)

    def __str__(self):
        return f"{self.display_name} ({self.mod_id})"
