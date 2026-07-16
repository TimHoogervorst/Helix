"""Registry that maps mod identifiers to concrete action model classes.

Each mod calls ``register_action_model()`` in its ``AppConfig.ready()``.
The logger uses ``get_action_model()`` to dispatch actions to the
correct table at runtime.

These functions are thin wrappers around the unified
:class:`~helix_core.mod_system.registry.BackendModRegistry` singleton.
"""

from typing import Optional


def register_action_model(mod_id: str, model_class: type) -> None:
    """Register a concrete action model for *mod_id*.

    Called from each mod's ``AppConfig.ready()``.  If *mod_id* is
    already registered the previous registration is silently replaced.

    Delegates to the unified ``BackendModRegistry`` singleton.
    """
    from helix_core.mod_system.registry import registry

    registry.register_action_model(mod_id, model_class)


def get_action_model(mod_id: str) -> Optional[type]:
    """Return the registered action model class for *mod_id*.

    Returns ``None`` when no model has been registered for *mod_id*.

    Delegates to the unified ``BackendModRegistry`` singleton.
    """
    from helix_core.mod_system.registry import registry

    return registry.get_action_model(mod_id)
