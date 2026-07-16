"""
Shared base test classes for backend tests.

Import from here instead of copy-pasting setUp boilerplate into every test file.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Folder, User


class BaseTestCase(TestCase):
    """Shared base for API tests.

    Provides:
      - self.client      — DRF APIClient
      - self.user        — a test User instance
      - self.folder      — a "Default" Folder
    """

    USERNAME = "testuser"
    PASSWORD = "testpass123"

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username=self.USERNAME, password=self.PASSWORD
        )
        self.folder = Folder.objects.create(name="Default")


class BaseServiceTestCase(TestCase):
    """Base for service-layer tests (no API client).

    Provides:
      - self.user        — a test User instance
      - self.folder      — a "Default" Folder
    """

    USERNAME = "testuser"
    PASSWORD = "testpass123"

    def setUp(self):
        self.user = User.objects.create_user(
            username=self.USERNAME, password=self.PASSWORD
        )
        self.folder = Folder.objects.create(name="Default")
