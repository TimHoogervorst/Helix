"""Action logging infrastructure.

Provides the abstract base model, a mod-specific registry, a
synchronous ``log_action()`` dispatcher that every mod plugs into,
and the declarative ``ActionLoggingMixin`` for DRF viewsets.
"""

from .base import AbstractBaseAction
from .logger import log_action
from .mixins import ActionLoggingMixin, logs_action
from .registry import get_action_model, register_action_model

__all__ = [
    "AbstractBaseAction",
    "ActionLoggingMixin",
    "log_action",
    "logs_action",
    "register_action_model",
    "get_action_model",
]
