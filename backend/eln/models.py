from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models


class NotebookEntry(models.Model):
    """An ELN notebook entry containing narrative text."""

    title = models.CharField(max_length=500)
    content = models.TextField(blank=True, default="")
    folder = models.ForeignKey(
        "core.Folder", on_delete=models.CASCADE, related_name="entries"
    )
    author = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="entries"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eln_entry"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class Mention(models.Model):
    """A parsed reference from an ELN entry to another object."""

    source_entry = models.ForeignKey(
        NotebookEntry, on_delete=models.CASCADE, related_name="mentions"
    )
    target_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    target_id = models.PositiveIntegerField()
    target = GenericForeignKey("target_type", "target_id")
    context = models.TextField(blank=True, default="")

    class Meta:
        db_table = "eln_mention"

    def __str__(self):
        return f"Mention in {self.source_entry_id} → {self.target_type}.{self.target_id}"
