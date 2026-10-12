from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import Organization, OrganizationMembership, OrganizationRole


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_organization_membership(sender, instance, created, **kwargs):
    if created:
        org = Organization.objects.first()
        if org is not None:
            OrganizationMembership.objects.create(
                user=instance,
                organization=org,
                role=OrganizationRole.USER,
            )


@receiver(pre_save, sender=settings.AUTH_USER_MODEL)
def prevent_deactivating_last_admin(sender, instance, **kwargs):
    if instance.pk is None:
        return
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        original = User.objects.get(pk=instance.pk)
    except User.DoesNotExist:
        return
    if original.is_active and not instance.is_active:
        membership = OrganizationMembership.objects.filter(
            user=instance,
            role=OrganizationRole.ADMIN,
        ).first()
        if membership is not None:
            if not OrganizationMembership.objects.filter(
                role=OrganizationRole.ADMIN,
                user__is_active=True,
            ).exclude(user=instance).exists():
                raise ValidationError(
                    "Cannot deactivate the last active Organization Admin."
                )
