"""
Shared base test classes for backend tests.

Import from here instead of copy-pasting setUp boilerplate into every test file.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Folder, Project, User


class BaseTestCase(TestCase):
    """Shared base for API tests.

    Provides:
      - self.client      — DRF APIClient
      - self.user        — a test User instance
      - self.project     — a test Project instance
      - self.folder      — a "Default" Folder belonging to self.project
      - self.root_folder — the hidden root Folder for self.project
    """

    USERNAME = "testuser"
    PASSWORD = "testpass123"

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username=self.USERNAME, password=self.PASSWORD
        )
        self.project = Project.objects.create(name="Test Project")
        self.root_folder = Folder.objects.create(
            name="root",
            parent=None,
            project=self.project,
        )
        self.folder = Folder.objects.create(
            name="Default",
            parent=self.root_folder,
            project=self.project,
        )


class BaseServiceTestCase(TestCase):
    """Base for service-layer tests (no API client).

    Provides:
      - self.user        — a test User instance
      - self.project     — a test Project instance
      - self.folder      — a "Default" Folder belonging to self.project
      - self.root_folder — the hidden root Folder for self.project
    """

    USERNAME = "testuser"
    PASSWORD = "testpass123"

    def setUp(self):
        self.user = User.objects.create_user(
            username=self.USERNAME, password=self.PASSWORD
        )
        self.project = Project.objects.create(name="Test Project")
        self.root_folder = Folder.objects.create(
            name="root",
            parent=None,
            project=self.project,
        )
        self.folder = Folder.objects.create(
            name="Default",
            parent=self.root_folder,
            project=self.project,
        )
