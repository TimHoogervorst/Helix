"""Action logging infrastructure.

.. WARNING:: Keep in sync with ``core/actions/__init__.py`` during the
   expand-contract transition.  Once the contract phase lands (all mods
   import from ``helix_core``), the original in ``core/`` will be removed.

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
