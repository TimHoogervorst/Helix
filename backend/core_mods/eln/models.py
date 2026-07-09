import hashlib
import json

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey, GenericRelation
from django.contrib.contenttypes.models import ContentType
from django.db import models

from core.abstracts import BrowsableItem
from core.actions.base import AbstractBaseAction
from core.constants import STATUS_CHOICES

# Re-export for backward compatibility — these are canonical in core_mods.tags.
from core_mods.tags.models import TAG_COLOR_CHOICES, TAG_ICON_CHOICES, Tag  # noqa: F401


class NotebookEntry(BrowsableItem):
    """An ELN notebook entry containing narrative text."""

    title = models.CharField(max_length=500)
    content = models.JSONField(blank=True, default=dict)
    folder = models.ForeignKey(
        "core.Folder", on_delete=models.CASCADE, related_name="entries", null=True, blank=True
    )
    author = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="entries", null=True, blank=True
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="in_progress",
    )
    updated_at = models.DateTimeField(auto_now=True)

    # M2M to tags.Tag — defined on the consumer side (Tag stays pure).
    tags = models.ManyToManyField(
        "tags.Tag",
        related_name="+",
        db_table="eln_tag_entries",
    )

    # Reverse relation for mentions where this entry is the source.
    mentions = GenericRelation("eln.Mention", content_type_field="source_type", object_id_field="source_id")

    class Meta:
        db_table = "eln_entry"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.display_id} — {self.title}" if self.display_id else self.title

    def _get_display_id_prefix(self) -> str:
        return "E"


class Mention(models.Model):
    """A parsed reference from one content object to another."""

    # Generic FK: source of the mention (NotebookEntry, etc.)
    source_type = models.ForeignKey(ContentType, on_delete=models.CASCADE, related_name="mention_sources")
    source_id = models.PositiveIntegerField()
    source = GenericForeignKey("source_type", "source_id")

    # Generic FK: target of the mention
    target_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    target_id = models.PositiveIntegerField()
    target = GenericForeignKey("target_type", "target_id")


    class Meta:
        db_table = "eln_mention"

    def __str__(self):
        return f"Mention in {self.source_type}.{self.source_id} → {self.target_type}.{self.target_id}"


class ElnAction(AbstractBaseAction):
    """Concrete action table for the ELN mod.

    Actions are logged automatically when entries are created or updated.
    The ``target_type`` / ``target_id`` pattern (e.g. ``"eln.entry"`` / 7)
    links back to the entry without a hard FK, keeping the action table
    generic.
    """

    class Meta:
        db_table = "eln_action"


class ContentVersion(models.Model):
    """Immutable snapshot of a NotebookEntry's content at save time.

    Every content save creates a new row.  The SHA-256 content hash
    enables hash-based no-op short-circuits — when the incoming content
    matches the latest version's hash, the update returns early without
    touching the database.

    Title-only or status-only updates do NOT create a ContentVersion.
    Only updates that include ``content`` in the payload do.

    Cascade delete is automatic via ``on_delete=CASCADE`` — deleting an
    entry removes all its ContentVersions.
    """

    SAVE_MODE_CHOICES = [
        ("autosave", "Autosave"),
        ("manual", "Manual"),
    ]

    entry = models.ForeignKey(
        NotebookEntry,
        on_delete=models.CASCADE,
        related_name="content_versions",
    )
    content = models.JSONField()
    content_hash = models.CharField(max_length=64)
    version_number = models.PositiveIntegerField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    save_mode = models.CharField(
        max_length=10,
        choices=SAVE_MODE_CHOICES,
        default="manual",
    )

    class Meta:
        db_table = "eln_content_version"
        ordering = ["entry", "-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["entry", "version_number"],
                name="uq_entry_version",
            ),
        ]

    # ── helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def hash_content(content: dict) -> str:
        """Return the SHA-256 hex digest of *content*.

        Uses ``sort_keys=True`` so that key-order differences don't
        produce different hashes for semantically identical documents.
        """
        return hashlib.sha256(
            json.dumps(content, sort_keys=True).encode()
        ).hexdigest()

    @classmethod
    def latest_for(cls, entry: NotebookEntry) -> "ContentVersion | None":
        """Return the most recent ContentVersion for *entry*, or None."""
        return cls.objects.filter(entry=entry).first()

    @classmethod
    def next_version_number(cls, entry: NotebookEntry) -> int:
        """Return the next sequential version number for *entry*."""
        latest = cls.latest_for(entry)
        return (latest.version_number + 1) if latest else 1


class EntryLock(models.Model):
    """Prevents simultaneous editing of the same NotebookEntry.

    A lock is acquired when a user opens an entry in the editor, refreshed
    periodically (``last_activity_at``), and released on navigation away.
    Stale locks (crashed browser, network loss) auto-expire after
    ``ELN_LOCK_TIMEOUT_MINUTES`` (default 5), letting another user steal
    the lock on their next acquire attempt.

    Cascade delete is automatic — deleting an entry removes its lock.
    """

    entry = models.OneToOneField(
        NotebookEntry,
        on_delete=models.CASCADE,
        related_name="lock",
    )
    held_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    acquired_at = models.DateTimeField(auto_now_add=True)
    last_activity_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eln_entry_lock"

    def is_stale(self) -> bool:
        """Return True if the lock has exceeded the configured timeout."""
        from datetime import timedelta

        from django.utils import timezone

        timeout = getattr(settings, "ELN_LOCK_TIMEOUT_MINUTES", 5)
        cutoff = timezone.now() - timedelta(minutes=timeout)
        return self.last_activity_at < cutoff
