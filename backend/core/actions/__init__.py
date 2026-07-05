"""Action logging infrastructure.

Provides the abstract base model, a mod-specific registry, and a
synchronous ``log_action()`` dispatcher that every mod plugs into.
"""

from .base import AbstractBaseAction
from .logger import log_action
from .registry import get_action_model, register_action_model

__all__ = [
    "AbstractBaseAction",
    "log_action",
    "register_action_model",
    "get_action_model",
]
