"""Session-level setup for backend tests (server + mods).

Ensures the ConcreteTestEntity table from test_abstracts.py exists before
*any* test runs.  The model class is registered in Django's app registry
at import time (module-level), so every Schema.objects.delete() cascade
collector discovers it.  Without this table, tests that run before
AbstractEntityFieldTests fail with "no such table".

This conftest lives at ``src/`` — the common ancestor of ``src/server`` and
``src/mods`` — so the fixture applies to both test trees.
"""

import pytest
from django.db import connection


@pytest.fixture(autouse=True, scope="session")
def _ensure_concrete_test_entity_table(django_db_setup, django_db_blocker):
    """Create the helix_test_concrete_entity table once for the session."""
    from helix_core.tests.test_abstracts import ConcreteTestEntity

    with django_db_blocker.unblock():
        with connection.schema_editor() as schema_editor:
            schema_editor.create_model(ConcreteTestEntity)
    yield
