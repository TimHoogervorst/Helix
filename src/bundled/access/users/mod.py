def register(mod):
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from .models import CoreAction
    from helix_core.core.models import User

    mod.register_action_model(CoreAction)
    target = mod.register_model("user", User)
    mod.register_custom_action(
        "core.user.deactivated", "User Deactivated", "edited", target
    )
