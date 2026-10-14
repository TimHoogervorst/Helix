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


# The canonical suite deliberately runs without the optional ELN package.
# These legacy tests use ELN concrete models as fixtures and belong in the
# separate ELN package test job until they are rewritten against the generic
# external-Mod fixture.
collect_ignore = [
    "helix_core/core/tests/test_abstracts.py",
    "helix_core/core/tests/test_actions_endpoint.py",
    "helix_core/core/tests/test_actions_logger.py",
    "helix_core/core/tests/test_ownership.py",
    "helix_core/tests/test_entity_hub.py",
    "helix_core/tests/test_mod_registry.py",
    "helix_core/tests/test_query_builder.py",
    "helix_core/mentions/tests/test_api.py",
    "helix_core/mentions/tests/test_prefix_resolver.py",
    "helix_core/mentions/tests/test_sync.py",
    "helix_core/tests/test_action_consolidation.py",
    "bundled/lims/tests/test_models.py",
    "bundled/access/access/tests/test_helpers.py",
    "bundled/access/access/tests/test_policies.py",
    "bundled/shared/library/tests/test_api.py",
]


@pytest.fixture(autouse=True, scope="session")
def _ensure_concrete_test_entity_table(django_db_setup, django_db_blocker):
    """Create the helix_test_concrete_entity table once for the session."""
    from helix_core.tests.test_abstracts import ConcreteTestEntity

    with django_db_blocker.unblock():
        with connection.schema_editor() as schema_editor:
            schema_editor.create_model(ConcreteTestEntity)
    yield
