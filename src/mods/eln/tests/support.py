"""ELN-owned integration fixtures; only supported Platform APIs are imported."""

from django.test import TestCase
from rest_framework.test import APIClient

from helix_core.public import Folder, Grant, Project, ProjectRole, User


class BaseTestCase(TestCase):
    USERNAME = "testuser"
    PASSWORD = "testpass123"

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username=self.USERNAME, password=self.PASSWORD
        )
        self.project = Project.objects.create(name="Test Project")
        self.folder = Folder.objects.create(
            name="Default", parent=None, project=self.project
        )
        Grant.objects.create(project=self.project, user=self.user, role=ProjectRole.EDIT)


class BaseServiceTestCase(TestCase):
    USERNAME = "testuser"
    PASSWORD = "testpass123"

    def setUp(self):
        self.user = User.objects.create_user(
            username=self.USERNAME, password=self.PASSWORD
        )
        self.project = Project.objects.create(name="Test Project")
        self.folder = Folder.objects.create(
            name="Default", parent=None, project=self.project
        )


EMPTY_DOC: dict = {"type": "doc", "content": [{"type": "paragraph"}]}


def make_doc_with_ref(display_id: str) -> dict:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [
            {"type": "text", "text": "See "},
            {"type": "reference", "attrs": {"displayId": display_id}},
            {"type": "text", "text": " for details."},
        ]}],
    }
