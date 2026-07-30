from helix_core.mod_system.registry import registry


def register():
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from .models import CoreAction

    registry.register_action_model("core", CoreAction)
