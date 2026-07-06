"""Tests for the seed_data management command."""

import os
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from core.models import CoreSetting, User


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
