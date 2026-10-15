"""Test models share the database lifecycle without forcing pure tests
to create a database. Model registration precedes cascade collection.
"""

import pytest
from django.db import connection

from helix_core.tests.fixtures.external_mod.models import ConcreteTestEntity


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    """Create and drop the fixture table only when a suite needs a database."""
    with django_db_blocker.unblock():
        with connection.schema_editor() as schema_editor:
            schema_editor.create_model(ConcreteTestEntity)
    yield
    with django_db_blocker.unblock():
        with connection.schema_editor() as schema_editor:
            schema_editor.delete_model(ConcreteTestEntity)
