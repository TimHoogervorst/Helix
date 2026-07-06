"""Synchronous action logger.

``log_action()`` derives the mod from ``target_type`` (the part before
the first dot) and dispatches to the correct concrete action table via
the registry.
"""

from typing import Optional

from django.contrib.auth import get_user_model

from .registry import get_action_model

User = get_user_model()


def log_action(
    user: User,
    action_type: str,
    target_type: str,
    target_id: int,
    metadata: Optional[dict] = None,
):
    """Create an action row in the correct mod-specific table.

    Derives the mod identifier from *target_type* (the segment before
    the first dot).  For example ``"eln.entry"`` dispatches to
    whichever model was registered under ``"eln"``.

    Args:
        user: The user who performed the action.
        action_type: Short verb, e.g. ``"created"`` or ``"edited"``.
        target_type: Namespaced target, e.g. ``"eln.entry"``.
        target_id: Primary key of the target record.
        metadata: Optional free-form payload (stored as JSON).

    Returns:
        The newly created action instance.

    Raises:
        ValueError: If no model is registered for the derived mod.
    """
    mod_id = target_type.split(".")[0]
    model_class = get_action_model(mod_id)
    if model_class is None:
        raise ValueError(
            f"No action model registered for mod '{mod_id}'. "
            f"Did you forget to call register_action_model() "
            f"in the mod's AppConfig.ready()?"
        )
    return model_class.objects.create(
        performed_by=user,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        metadata=metadata or {},
    )
