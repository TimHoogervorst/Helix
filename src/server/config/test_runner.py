"""Custom test runner that provisions test-only database tables.

``ConcreteTestEntity`` is defined at module level in
``helix_core/tests/test_abstracts.py``, so it registers in Django's app
registry as soon as test discovery imports that module.  Its table is not
part of any migration, so the standard test-database setup never creates it.

Any test that triggers a ``Schema`` delete (or otherwise walks the deletion
collector) discovers this model through its ``PROTECT`` foreign key and
queries ``helix_test_concrete_entity``, which fails with "no such table"
unless we create it up front.

Under pytest this is handled by the session-scoped fixture in
``conftest.py``; this runner provides the equivalent guarantee when running
via ``manage.py test``.
"""

from django.db import connection
from django.test.runner import DiscoverRunner


class HelixTestRunner(DiscoverRunner):
    """DiscoverRunner that creates the test-only ConcreteTestEntity table."""

    def setup_databases(self, **kwargs):
        old_config = super().setup_databases(**kwargs)

        from helix_core.tests.test_abstracts import ConcreteTestEntity

        with connection.schema_editor() as schema_editor:
            schema_editor.create_model(ConcreteTestEntity)

        return old_config
