"""Registry that maps mod identifiers to concrete action model classes.

Each mod calls ``register_action_model()`` in its ``AppConfig.ready()``.
The logger uses ``get_action_model()`` to dispatch actions to the
correct table at runtime.
"""

from typing import Optional

_registry: dict[str, type] = {}


def register_action_model(mod_id: str, model_class: type) -> None:
    """Register a concrete action model for *mod_id*.

    Called from each mod's ``AppConfig.ready()``.  If *mod_id* is
    already registered the previous registration is silently replaced.
    """
    _registry[mod_id] = model_class


def get_action_model(mod_id: str) -> Optional[type]:
    """Return the registered action model class for *mod_id*.

    Returns ``None`` when no model has been registered for *mod_id*.
    """
    return _registry.get(mod_id)
