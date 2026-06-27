from django.contrib.contenttypes.fields import GenericForeignKey, GenericRelation
from django.contrib.contenttypes.models import ContentType
from django.db import models

from core.abstracts import BrowsableItem


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
    updated_at = models.DateTimeField(auto_now=True)

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

    context = models.TextField(blank=True, default="")

    class Meta:
        db_table = "eln_mention"

    def __str__(self):
        return f"Mention in {self.source_type}.{self.source_id} → {self.target_type}.{self.target_id}"
