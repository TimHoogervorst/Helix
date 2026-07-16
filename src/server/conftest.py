"""Shared pytest fixtures for backend tests.

Add fixtures here as the test suite grows.  All test files import from
this module automatically — no explicit import needed in each test file.

Usage::

    def test_something(api_client, user):
        api_client.force_authenticate(user)
        ...
"""

import pytest
from rest_framework.test import APIClient
from core.models import Folder, User


@pytest.fixture
def api_client():
    """Unauthenticated DRF test client."""
    return APIClient()


@pytest.fixture
def user():
    """Plain User instance (no permissions)."""
    return User.objects.create_user(
        username="testuser",
        password="testpass123",
    )


@pytest.fixture
def folder():
    """Top-level Folder instance."""
    return Folder.objects.create(name="Default")


# Apply django_db marker at module level so test modules that import
# from this conftest get database access automatically.
pytestmark = pytest.mark.django_db
