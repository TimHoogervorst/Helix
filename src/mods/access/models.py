from django.conf import settings
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.db import models

from core.models import Folder
from helix_core.actions.base import AbstractBaseAction


class AccessAction(AbstractBaseAction):
    """Concrete action table for access-administration operations.

    Every access-administration mutation — Grants, Folder Shares, Teams,
    Projects, Organization edits — writes exactly one row here through
    the standard action-log machinery.
    """

    class Meta:
        db_table = "access_action"
        verbose_name = "Access action"
        verbose_name_plural = "Access actions"


class OrganizationRole(models.TextChoices):
    USER = "user", "User"
    ADMIN = "admin", "Admin"


class ProjectRole(models.TextChoices):
    READ = "read", "Read"
    EDIT = "edit", "Edit"


class ShareLevel(models.TextChoices):
    READ = "read", "Read"
    READ_WRITE = "read_write", "Read + Write"


class Organization(models.Model):
    _policy_resource_category = "organization_admin"

    name = models.CharField(max_length=255)
    short_description = models.TextField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    icon_key = models.CharField(max_length=100, blank=True, default="")
    color_key = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        db_table = "access_organization"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self._state.adding and Organization.objects.exists():
            raise ValidationError(
                "Only one Organization may exist per deployment."
            )
        super().save(*args, **kwargs)


class Team(models.Model):
    """A named collection of Users within the Organization.

    Wraps a Django Group one-to-one for canonical membership storage.
    There is no Team Admin role — only Organization Admins can mutate
    Teams or their membership.
    """

    _policy_resource_category = "organization_admin"

    group = models.OneToOneField(
        Group,
        on_delete=models.PROTECT,
        related_name="team",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="teams",
    )
    icon_key = models.CharField(max_length=100, blank=True, default="")
    color_key = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        db_table = "access_team"

    def __str__(self):
        return self.group.name if self.group_id else f"Team {self.pk}"

    @property
    def name(self):
        return self.group.name if self.group_id else ""

    @property
    def blocked_from_deletion(self) -> bool:
        return self.grants.exists()


class OrganizationMembership(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="organization_membership",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(
        max_length=10,
        choices=OrganizationRole.choices,
        default=OrganizationRole.USER,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "access_organization_membership"

    def __str__(self):
        return f"{self.user.username} — {self.organization.name} ({self.role})"

    def clean(self):
        super().clean()
        if self.role == OrganizationRole.USER and self.pk is not None:
            original = OrganizationMembership.objects.get(pk=self.pk)
            if original.role == OrganizationRole.ADMIN and not _has_other_active_admin(
                excluding_user=self.user
            ):
                raise ValidationError(
                    "Cannot demote the last active Organization Admin."
                )

    def delete(self, *args, **kwargs):
        if self.role == OrganizationRole.ADMIN and self.user.is_active:
            if not _has_other_active_admin(excluding_user=self.user):
                raise ValidationError(
                    "Cannot delete the membership of the last active "
                    "Organization Admin."
                )
        super().delete(*args, **kwargs)


def _has_other_active_admin(excluding_user=None) -> bool:
    qs = OrganizationMembership.objects.filter(
        role=OrganizationRole.ADMIN,
        user__is_active=True,
    )
    if excluding_user is not None:
        qs = qs.exclude(user=excluding_user)
    return qs.exists()


class Grant(models.Model):
    """Assigns a fixed Read or Edit Project Role to a User or Team.

    Exactly one Grantee (User *or* Team) must be non-null.  A conditional
    unique constraint allows at most one Grant per Project–User and one
    per Project–Team pair.  Changing a role updates the existing row.
    """

    _policy_resource_category = "organization_admin"

    project = models.ForeignKey(
        "core.Project",
        on_delete=models.CASCADE,
        related_name="grants",
    )
    role = models.CharField(
        max_length=10,
        choices=ProjectRole.choices,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="grants",
        null=True,
        blank=True,
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.PROTECT,
        related_name="grants",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "access_grant"
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(user__isnull=False, team__isnull=True)
                    | models.Q(user__isnull=True, team__isnull=False)
                ),
                name="chk_grant_exactly_one_grantee",
            ),
            models.UniqueConstraint(
                fields=["project", "user"],
                condition=models.Q(user__isnull=False),
                name="uq_grant_project_user",
            ),
            models.UniqueConstraint(
                fields=["project", "team"],
                condition=models.Q(team__isnull=False),
                name="uq_grant_project_team",
            ),
        ]

    def __str__(self):
        grantee = (
            self.user.username
            if self.user_id
            else self.team.name if self.team_id else "unknown"
        )
        return f"{grantee} — {self.role} on {self.project.name}"

    def clean(self):
        super().clean()
        if self.user_id and self.team_id:
            raise ValidationError("A Grant must reference exactly one grantee (User or Team).")
        if not self.user_id and not self.team_id:
            raise ValidationError("A Grant must reference a User or a Team.")


class FolderShare(models.Model):
    """Shares one immediate child of a source Project root into a target Project.

    Only Organization Admins create, change, or revoke Folder Shares.
    One row per Folder–target pair.  The source Folder must be an
    immediate child of its Project's hidden root — nested source Folders
    and hidden roots themselves are rejected.

    Shared access is the intersection of the user's target Project Role
    and the share level.
    """

    _policy_resource_category = "organization_admin"

    source_folder = models.ForeignKey(
        "core.Folder",
        on_delete=models.CASCADE,
        related_name="outgoing_shares",
    )
    target_project = models.ForeignKey(
        "core.Project",
        on_delete=models.CASCADE,
        related_name="incoming_shares",
    )
    level = models.CharField(
        max_length=15,
        choices=ShareLevel.choices,
    )

    class Meta:
        db_table = "access_folder_share"
        constraints = [
            models.UniqueConstraint(
                fields=["source_folder", "target_project"],
                name="uq_folder_share_source_target",
            ),
        ]

    def __str__(self):
        return (
            f"FolderShare {self.source_folder.path} → "
            f"{self.target_project.name} ({self.get_level_display()})"
        )

    def clean(self):
        super().clean()

        if self.source_folder_id is None:
            return

        source = self.source_folder

        if source.project_id == self.target_project_id:
            raise ValidationError(
                "The source Project cannot be the target Project."
            )

        if not source.is_root_child:
            raise ValidationError(
                "Only immediate children of the Project root can be shared."
            )

        overlapping = (
            FolderShare.objects
            .filter(target_project_id=self.target_project_id)
            .exclude(pk=self.pk)
            .select_related("source_folder")
        )

        for share in overlapping:
            if _is_ancestor_or_descendant(share.source_folder, source):
                raise ValidationError(
                    "An ancestor or descendant of this Folder is already "
                    "shared to the same target Project."
                )

        name_collision_qs = FolderShare.objects.filter(
            target_project_id=self.target_project_id,
            source_folder__name=source.name,
        ).exclude(pk=self.pk)
        if name_collision_qs.exists():
            raise ValidationError(
                f"A shared Folder named \"{source.name}\" already exists "
                f"in the target Project."
            )

        own_child = (
            Folder.objects
            .filter(
                models.Q(parent__isnull=True) | models.Q(parent__name="root"),
                project_id=self.target_project_id,
                name=source.name,
            )
            .exists()
        )
        if own_child:
            raise ValidationError(
                f"A Folder named \"{source.name}\" already exists at the "
                f"root of the target Project."
            )


def _is_ancestor_or_descendant(a, b) -> bool:
    if a.id == b.id:
        return True

    a_ancestors = _ancestor_ids(a)
    b_ancestors = _ancestor_ids(b)
    if a.id in b_ancestors or b.id in a_ancestors:
        return True

    return False


def _ancestor_ids(folder) -> set:
    ids = set()
    node = folder.parent
    while node is not None:
        ids.add(node.id)
        node = node.parent
    return ids
