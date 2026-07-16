from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models


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
