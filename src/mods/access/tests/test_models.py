"""Tests for Organization and OrganizationMembership models."""

from django.apps import apps
from django.core.exceptions import ValidationError
from django.test import TestCase

from core.models import User
from mods.access.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from mods.access.tests.factories import ensure_membership


class AutoMembershipSignalTests(TestCase):
    def test_new_user_auto_creates_membership_when_org_exists(self):
        """Creating a User fires post_save which creates a User membership."""
        org = Organization.objects.create(name="Test Lab")
        # Ensure signals are connected
        app_config = apps.get_app_config("access")
        app_config.ready()
        user = User.objects.create_user(username="auto", password="pass")
        membership = OrganizationMembership.objects.filter(user=user).first()
        self.assertIsNotNone(membership)
        self.assertEqual(membership.role, OrganizationRole.USER)
        self.assertEqual(membership.organization, org)

    def test_new_user_no_org_does_not_crash(self):
        """No Organization exists — signal is a no-op."""
        app_config = apps.get_app_config("access")
        app_config.ready()
        user = User.objects.create_user(username="no_org", password="pass")
        self.assertEqual(OrganizationMembership.objects.filter(user=user).count(), 0)


class OrganizationModelTests(TestCase):
    def test_create_organization(self):
        org = Organization.objects.create(name="Test Lab")
        self.assertEqual(org.name, "Test Lab")
        self.assertFalse(org.short_description)
        self.assertFalse(org.address)

    def test_singleton_enforcement_prevents_second_organization(self):
        Organization.objects.create(name="First")
        with self.assertRaises(ValidationError):
            org2 = Organization(name="Second")
            org2.save()

    def test_str_returns_name(self):
        org = Organization.objects.create(name="Acme Lab")
        self.assertEqual(str(org), "Acme Lab")


class OrganizationMembershipModelTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Lab")
        self.user = User.objects.create_user(username="testuser", password="pass")
        self.admin = User.objects.create_user(username="adminuser", password="pass")
        # The post_save signal auto-creates a USER membership for each User
        # once an Organization exists. These tests manage memberships
        # explicitly, so clear the auto-created rows for a clean slate.
        OrganizationMembership.objects.all().delete()

    def test_create_membership(self):
        membership = OrganizationMembership.objects.create(
            user=self.user, organization=self.org, role=OrganizationRole.USER,
        )
        self.assertEqual(membership.role, OrganizationRole.USER)
        self.assertEqual(membership.organization, self.org)

    def test_one_to_one_user_constraint(self):
        OrganizationMembership.objects.create(
            user=self.user, organization=self.org,
        )
        with self.assertRaises(Exception):
            OrganizationMembership.objects.create(
                user=self.user, organization=self.org,
            )

    def test_str_representation(self):
        membership = OrganizationMembership.objects.create(
            user=self.admin, organization=self.org, role=OrganizationRole.ADMIN,
        )
        expected = f"{self.admin.username} — {self.org.name} (admin)"
        self.assertEqual(str(membership), expected)

    def test_cannot_demote_last_active_admin(self):
        OrganizationMembership.objects.create(
            user=self.admin, organization=self.org, role=OrganizationRole.ADMIN,
        )
        membership = OrganizationMembership.objects.get(user=self.admin)
        membership.role = OrganizationRole.USER
        with self.assertRaises(ValidationError):
            membership.clean()
            membership.save()

    def test_can_demote_admin_when_another_admin_exists(self):
        admin2 = User.objects.create_user(username="admin2", password="pass")
        OrganizationMembership.objects.create(
            user=self.admin, organization=self.org, role=OrganizationRole.ADMIN,
        )
        ensure_membership(admin2, self.org, OrganizationRole.ADMIN)
        membership = OrganizationMembership.objects.get(user=self.admin)
        membership.role = OrganizationRole.USER
        membership.clean()
        membership.save()
        self.assertEqual(membership.role, OrganizationRole.USER)

    def test_cannot_delete_last_active_admin_membership(self):
        OrganizationMembership.objects.create(
            user=self.admin, organization=self.org, role=OrganizationRole.ADMIN,
        )
        membership = OrganizationMembership.objects.get(user=self.admin)
        with self.assertRaises(ValidationError):
            membership.delete()

    def test_can_delete_non_admin_membership(self):
        membership = OrganizationMembership.objects.create(
            user=self.user, organization=self.org, role=OrganizationRole.USER,
        )
        membership.delete()
        self.assertEqual(OrganizationMembership.objects.filter(user=self.user).count(), 0)

    def test_inactive_admin_does_not_protect_deletion(self):
        inactive = User.objects.create_user(
            username="inactive", password="pass", is_active=False,
        )
        ensure_membership(inactive, self.org, OrganizationRole.ADMIN)
        OrganizationMembership.objects.create(
            user=self.admin, organization=self.org, role=OrganizationRole.ADMIN,
        )
        # Deleting the active admin raises — the inactive admin doesn't count
        # as an active admin, so the guard still protects the last active one.
        membership = OrganizationMembership.objects.get(user=self.admin)
        with self.assertRaises(ValidationError):
            membership.delete()

    def test_cannot_deactivate_last_active_admin_user(self):
        OrganizationMembership.objects.create(
            user=self.admin, organization=self.org, role=OrganizationRole.ADMIN,
        )
        self.admin.is_active = False
        with self.assertRaises(ValidationError):
            self.admin.save()

    def test_can_deactivate_user_when_not_last_admin(self):
        admin2 = User.objects.create_user(username="admin2", password="pass")
        OrganizationMembership.objects.create(
            user=self.admin, organization=self.org, role=OrganizationRole.ADMIN,
        )
        ensure_membership(admin2, self.org, OrganizationRole.ADMIN)
        self.admin.is_active = False
        self.admin.save()
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.is_active)
