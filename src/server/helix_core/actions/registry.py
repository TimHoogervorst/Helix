"""Registry that maps mod identifiers to concrete action model classes.

Each mod calls ``register_action_model()`` in its ``AppConfig.ready()``.
The logger uses ``get_action_model()`` to dispatch actions to the
correct table at runtime.

These functions are thin wrappers around the unified
:class:`~helix_core.mod_system.registry.BackendModRegistry` singleton.
"""

from typing import Any, Optional


def register_action_model(mod_id: str, model_class: type) -> None:
    """Register a concrete action model for *mod_id*.

    Called from each mod's ``AppConfig.ready()``.  If *mod_id* is
    already registered the previous registration is silently replaced.

    Also auto-derives the three core CRUD actions (``created``,
    ``edited``, ``deleted``) for *mod_id*.

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


def register_custom_action(
    mod_id: str,
    action_id: str,
    label: str,
    core: str,
    target_model: str,
) -> None:
    """Register a custom action for *mod_id*.

    Custom actions map to a core CRUD verb (``created``, ``edited``,
    or ``deleted``).  They appear in the action catalog alongside
    the auto-derived core actions.

    Delegates to the unified ``BackendModRegistry`` singleton.
    """
    from helix_core.mod_system.registry import registry

    registry.register_custom_action(mod_id, action_id, label, core, target_model)


def get_action_catalog(mod_id: str) -> list[dict[str, Any]]:
    """Return the full action catalog for *mod_id*.

    Returns all actions — core (``created``, ``edited``, ``deleted``)
    and custom — as a list of dicts with keys ``id``, ``label``,
    ``action_type``, and ``target_model``.

    Delegates to the unified ``BackendModRegistry`` singleton.
    """
    from helix_core.mod_system.registry import registry

    return registry.get_action_catalog(mod_id)


def validate_action(action: str) -> bool:
    """Return ``True`` if *action* is a registered action.

    Checks core action verbs (``created``, ``edited``, ``deleted``)
    across all registered mods, plus custom actions by exact match.

    Delegates to the unified ``BackendModRegistry`` singleton.
    """
    from helix_core.mod_system.registry import registry

    return registry.validate_action(action)
