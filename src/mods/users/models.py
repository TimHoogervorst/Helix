"""Models for the users core-mod.

``CoreAction`` is the concrete action-log table for admin user operations
(create, deactivate, etc.).  It inherits the six static columns from
``AbstractBaseAction``.
"""

from helix_core.actions.base import AbstractBaseAction


class CoreAction(AbstractBaseAction):
    """Concrete action table for admin user-management operations."""

    class Meta:
        db_table = "core_action"
        verbose_name = "Core action"
        verbose_name_plural = "Core actions"
