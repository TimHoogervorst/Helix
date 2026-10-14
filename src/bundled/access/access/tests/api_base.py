"""Test base for requests through the access Mod's public HTTP routes."""

from django.test import TestCase, override_settings


class AccessApiTestCase(TestCase):
    @classmethod
    def setUpClass(cls):
        cls._urlconf_override = override_settings(
            ROOT_URLCONF="bundled.access.access.tests.urls",
        )
        cls._urlconf_override.enable()
        try:
            super().setUpClass()
        except Exception:
            cls._urlconf_override.disable()
            raise

    @classmethod
    def tearDownClass(cls):
        try:
            super().tearDownClass()
        finally:
            cls._urlconf_override.disable()
