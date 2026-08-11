from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class OrganizationRole(models.TextChoices):
    USER = "user", "User"
    ADMIN = "admin", "Admin"


class Organization(models.Model):
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
