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

    @property
    def path(self) -> str:
        """Full /-separated path from root to this folder (e.g. /Projects/Sub)."""
        segments = []
        node = self
        while node is not None:
            segments.append(node.name)
            node = node.parent
        segments.reverse()
        return "/" + "/".join(segments)

    def __str__(self):
        if self.parent:
            return f"{self.parent.name} / {self.name}"
        return self.name


class PinnedWorkspace(models.Model):
    """A user-pinned workspace bookmark.

    Cross-cutting model — works for any workspace type (LIMS entities,
    ELN entries, future workspace types).  Pins are lightweight bookmarks:
    the backend stores whatever the frontend sends without resolving or
    validating against workspace records.
    """

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="pinned_workspaces"
    )
    display_id = models.CharField(max_length=255)
    label = models.CharField(max_length=255)
    url = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "core_pinned_workspace"
        ordering = ["-created_at"]
        unique_together = [["user", "url"]]

    def __str__(self):
        return f"{self.display_id} ({self.user.username})"
