import random

from django.contrib.auth.models import AbstractUser
from django.db import models

# 8-color palette for avatar backgrounds — randomly assigned at user creation
USER_COLOR_PALETTE = [
    "#4A90D9",  # blue
    "#7B61FF",  # purple
    "#E06C75",  # red
    "#56B6C2",  # teal
    "#D19A66",  # orange
    "#98C379",  # green
    "#C678DD",  # magenta
    "#E5C07B",  # yellow
]


def random_user_color() -> str:
    return random.choice(USER_COLOR_PALETTE)


class User(AbstractUser):
    """Custom user model. Adds auth_token via DRF's Token model.

    The ``color`` field stores a hex color used as the avatar background.
    The ``profile`` JSONField holds rich profile data (title, position,
    pronouns, location, bio, orcid).
    """

    color = models.CharField(max_length=7, default=random_user_color)
    profile = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "core_user"

    def __str__(self):
        return self.username


class CoreSetting(models.Model):
    """Key/value configuration store for shell-level settings.

    Persisted in the database so admins can toggle settings from the UI
    without a redeploy.  The ``value`` field is JSON — consumers must cast.
    """

    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField(default=dict)

    class Meta:
        db_table = "core_setting"

    def __str__(self):
        return f"{self.key} = {self.value}"


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
