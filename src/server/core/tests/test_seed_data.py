"""Tests for the seed_data management command."""

import os
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from core.models import CoreSetting, User
from mods.users.models import Affiliation, Publication, Recognition


class SeedDataTests(TestCase):
    """Test the idempotent seed_data management command."""

    def call_seed(self, env_overrides=None):
        """Run the seed command with optional env var overrides and return its output."""
        out = StringIO()
        with patch.dict(os.environ, env_overrides or {}, clear=False):
            call_command("seed_data", stdout=out)
        return out.getvalue()

    # ── Superuser seeding ──────────────────────────────────────────────────

    def test_creates_superuser_from_env_vars(self):
        """SEED_USERNAME and SEED_PASSWORD from env create a superuser."""
        self.call_seed({
            "SEED_USERNAME": "seedadmin",
            "SEED_PASSWORD": "seedpass123",
        })

        user = User.objects.get(username="seedadmin")
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.check_password("seedpass123"))

    def test_falls_back_to_admin_admin_when_env_vars_not_set(self):
        """When env vars are absent, os.environ.get defaults apply (admin/admin)."""
        # Do NOT set SEED_USERNAME or SEED_PASSWORD so the defaults kick in.
        # Only set unrelated env to avoid interfering with other keys.
        self.call_seed({})

        user = User.objects.filter(username="admin").first()
        self.assertIsNotNone(user)
        self.assertTrue(user.is_superuser)

    def test_is_idempotent_for_superuser(self):
        """Running seed twice does not create duplicate users or crash."""
        self.call_seed({
            "SEED_USERNAME": "idempotent_user",
            "SEED_PASSWORD": "pass1",
        })
        self.assertEqual(User.objects.filter(username="idempotent_user").count(), 1)

        # Second run should skip, not fail
        out = self.call_seed({
            "SEED_USERNAME": "idempotent_user",
            "SEED_PASSWORD": "pass2",
        })
        self.assertEqual(User.objects.filter(username="idempotent_user").count(), 1)
        self.assertIn("already exists", out)

    def test_creates_admin_organization_membership(self):
        """Seeding a superuser also creates an Admin Organization Membership."""
        from mods.access.models import OrganizationMembership, OrganizationRole

        self.call_seed({
            "SEED_USERNAME": "admin_member",
            "SEED_PASSWORD": "pass123",
        })

        user = User.objects.get(username="admin_member")
        membership = OrganizationMembership.objects.get(user=user)
        self.assertEqual(membership.role, OrganizationRole.ADMIN)

    def test_promotes_existing_membership_to_admin(self):
        """A superuser whose membership was auto-created as USER is promoted."""
        from mods.access.models import (
            Organization,
            OrganizationMembership,
            OrganizationRole,
        )

        org = Organization.objects.create(name="Pre-existing Lab")
        user = User.objects.create_superuser(
            username="pre_promoted", password="pass123",
        )
        # The post_save signal has already created a USER membership.
        self.assertEqual(
            OrganizationMembership.objects.get(user=user).role,
            OrganizationRole.USER,
        )

        self.call_seed({
            "SEED_USERNAME": "pre_promoted",
            "SEED_PASSWORD": "pass123",
        })

        membership = OrganizationMembership.objects.get(user=user)
        self.assertEqual(membership.role, OrganizationRole.ADMIN)
        self.assertEqual(membership.organization, org)

    # ── CoreSetting seeding ────────────────────────────────────────────────

    def test_creates_allow_self_registration_setting_from_env(self):
        """ALLOW_SELF_REGISTRATION=true creates the CoreSetting with value True."""
        self.call_seed({"ALLOW_SELF_REGISTRATION": "true"})

        setting = CoreSetting.objects.get(key="allow_self_registration")
        self.assertTrue(setting.value)

    def test_allow_self_registration_defaults_to_false(self):
        """When ALLOW_SELF_REGISTRATION is not 'true', value defaults to False."""
        self.call_seed({"ALLOW_SELF_REGISTRATION": "false"})

        setting = CoreSetting.objects.get(key="allow_self_registration")
        self.assertFalse(setting.value)

    def test_is_idempotent_for_setting(self):
        """Running seed twice does not overwrite an existing CoreSetting."""
        CoreSetting.objects.create(key="allow_self_registration", value=True)

        out = self.call_seed({"ALLOW_SELF_REGISTRATION": "false"})
        setting = CoreSetting.objects.get(key="allow_self_registration")
        # Existing value preserved, not overwritten
        self.assertTrue(setting.value)
        self.assertIn("already exists", out)

    # ── Profile data seeding ─────────────────────────────────────────────────

    def test_seeds_profile_json_on_new_user(self):
        """Seed populates profile JSON on a newly created superuser."""
        self.call_seed({
            "SEED_USERNAME": "prof_test",
            "SEED_PASSWORD": "pass123",
        })

        user = User.objects.get(username="prof_test")
        self.assertIsInstance(user.profile, dict)
        self.assertEqual(user.profile["title"], "")
        self.assertEqual(user.profile["position"], "System Administrator")
        self.assertIn("Platform administrator", user.profile["bio"])

    def test_seeds_affiliations_on_new_user(self):
        """Seed creates two affiliations for the new user."""
        self.call_seed({
            "SEED_USERNAME": "aff_test",
            "SEED_PASSWORD": "pass123",
        })

        user = User.objects.get(username="aff_test")
        affiliations = Affiliation.objects.filter(user=user)
        self.assertEqual(affiliations.count(), 2)
        institutions = {a.institution for a in affiliations}
        self.assertIn("Helix Platform", institutions)
        self.assertIn("OpenScience Initiative", institutions)

    def test_seeds_publications_on_new_user(self):
        """Seed creates two publications for the new user."""
        self.call_seed({
            "SEED_USERNAME": "pub_test",
            "SEED_PASSWORD": "pass123",
        })

        user = User.objects.get(username="pub_test")
        publications = Publication.objects.filter(user=user)
        self.assertEqual(publications.count(), 2)
        titles = {p.title for p in publications}
        self.assertIn("Helix: An open-science platform for collaborative research", titles)

    def test_seeds_recognitions_on_new_user(self):
        """Seed creates two recognitions for the new user."""
        self.call_seed({
            "SEED_USERNAME": "rec_test",
            "SEED_PASSWORD": "pass123",
        })

        user = User.objects.get(username="rec_test")
        recognitions = Recognition.objects.filter(user=user)
        self.assertEqual(recognitions.count(), 2)
        titles = {r.title for r in recognitions}
        self.assertIn("Best Open-Source Tool", titles)

    def test_profile_data_is_idempotent(self):
        """Running seed twice does not duplicate profile lists."""
        env = {"SEED_USERNAME": "idem_profile", "SEED_PASSWORD": "pass"}
        self.call_seed(env)
        out = self.call_seed(env)

        user = User.objects.get(username="idem_profile")
        self.assertEqual(Affiliation.objects.filter(user=user).count(), 2)
        self.assertEqual(Publication.objects.filter(user=user).count(), 2)
        self.assertEqual(Recognition.objects.filter(user=user).count(), 2)
        self.assertIn("Profile already populated", out)
