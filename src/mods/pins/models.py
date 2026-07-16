from django.conf import settings
from django.db import models


class PinnedWorkspace(models.Model):
    """A user-pinned workspace bookmark.

    Cross-cutting model — works for any workspace type (LIMS entities,
    ELN entries, future workspace types).  Pins are lightweight bookmarks:
    the backend stores whatever the frontend sends without resolving or
    validating against workspace records.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pinned_workspaces",
    )
    display_id = models.CharField(max_length=255)
    label = models.CharField(max_length=255, blank=True, default="")
    url = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "core_pinned_workspace"
        ordering = ["-created_at"]
        unique_together = [["user", "url"]]

    def __str__(self):
        return f"{self.display_id} ({self.user.username})"
