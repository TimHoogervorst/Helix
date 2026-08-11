import random
import uuid

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
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


class Project(models.Model):
    """First-class container owning one hidden root Folder and every Entry
    and Entity within it.

    Projects are the access boundary of the system — all permissions are
    expressed as Grants on Projects.  Only Organization Admins create,
    rename, archive, restore, recolor, or re-icon Projects.

    The ``uid`` is the immutable generated ID used in URLs; renaming a
    Project keeps its UID stable.
    """

    _policy_resource_category = "organization_admin"

    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    name = models.CharField(max_length=255)
    icon_key = models.CharField(max_length=100, blank=True, default="")
    color_key = models.CharField(max_length=100, blank=True, default="")
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "core_project"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Folder(models.Model):
    """Hierarchical folder for organizing entries and entities.

    Every Folder belongs to exactly one Project.  The Folder whose
    ``parent`` is ``None`` within a given Project is the hidden root —
    it exists for data integrity and is never surfaced as ordinary user
    content.
    """

    name = models.CharField(max_length=255)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="folders",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "core_folder"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["project"],
                condition=models.Q(parent__isnull=True),
                name="uq_one_root_per_project",
            ),
        ]

    def clean(self):
        super().clean()
        if self.pk is not None and self.project_id is not None and self.parent_id is None:
            existing = (
                Folder.objects
                .filter(project=self.project, parent__isnull=True)
                .exclude(pk=self.pk)
                .exists()
            )
            if existing:
                raise ValidationError(
                    "A root Folder (parent is null) already exists for this Project."
                )

    @property
    def is_hidden_root(self) -> bool:
        return self.parent_id is None and self.project_id is not None

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
