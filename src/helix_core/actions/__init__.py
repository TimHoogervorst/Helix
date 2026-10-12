"""Action logging infrastructure.

Provides the abstract base model, a mod-specific registry, a
synchronous ``log_action()`` dispatcher that every mod plugs into,
and the declarative ``ActionLoggingMixin`` for DRF viewsets.
"""

from .base import AbstractBaseAction
from .logger import bulk_log_actions, log_action
from .mixins import ActionLoggingMixin, logs_action
from .registry import (
    get_action_catalog,
    get_action_model,
    register_action_model,
    register_custom_action,
    validate_action,
)

__all__ = [
    "AbstractBaseAction",
    "ActionLoggingMixin",
    "bulk_log_actions",
    "get_action_catalog",
    "get_action_model",
    "log_action",
    "logs_action",
    "register_action_model",
    "register_custom_action",
    "validate_action",
]
