"""Public Platform SDK for Helix backend Mods."""

from .public import (
    ModelReference,
    Mod,
    ModRegistrar,
    ServiceReference,
    SignalKind,
    TypedService,
    make_app_config,
)

__all__ = [
    "ModelReference",
    "Mod",
    "ModRegistrar",
    "ServiceReference",
    "SignalKind",
    "TypedService",
    "make_app_config",
    "AbstractBaseAction",
    "ActionLoggingMixin",
    "log_action",
    "logs_action",
]


def __getattr__(name: str):
    """Load model-backed Action helpers only after Django setup."""
    if name in {
        "AbstractBaseAction",
        "ActionLoggingMixin",
        "log_action",
        "logs_action",
    }:
        from .actions import (
            AbstractBaseAction,
            ActionLoggingMixin,
            log_action,
            logs_action,
        )

        return locals()[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
