from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model. Adds auth_token via DRF's Token model."""

    class Meta:
        db_table = "core_user"

    def __str__(self):
        return self.username


class Folder(models.Model):
    """Hierarchical folder for organizing entries and entities."""

    name = models.CharField(max_length=255)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "core_folder"
        ordering = ["name"]

    def __str__(self):
        if self.parent:
            return f"{self.parent.name} / {self.name}"
        return self.name
