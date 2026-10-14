"""Test models share the database lifecycle without forcing pure tests
to create a database. Model registration precedes cascade collection.
"""

import pytest
from django.db import connection


# The canonical suite deliberately runs without the optional ELN package.
# These mixed legacy suites still borrow ELN models. Restoration tickets replace
# generic examples with Platform fixtures and move genuinely external behavior
# to its owner; Helix does not maintain an ELN-specific test job.
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
