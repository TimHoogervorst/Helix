"""Backend registration for the dropdowns mod.

Called by ModLoader after topological sort.  Populates the backend
registry with the dropdown action model, URL patterns, and
pre-seeds the built-in "Status" dropdown.
"""

from django.urls import include, path

from helix_core.mod_system.registry import registry


def _seed_builtin_dropdowns():
    """Pre-seed the Status dropdown with "In Progress" and "Finished".

    Idempotent — uses get_or_create so repeated calls on boot are safe.
    """
    from .models import Dropdown

    dropdown, created = Dropdown.objects.get_or_create(
        name="Status",
        defaults={
            "options": ["In Progress", "Finished"],
        },
    )
    # If the dropdown already existed but has no options, fill them in.
    if not created and not dropdown.options:
        dropdown.options = ["In Progress", "Finished"]
        dropdown.save(update_fields=["options"])


def register():
    """Called by ModLoader after topological sort."""
    from .models import DropdownsAction

    registry.register_action_model("dropdowns", DropdownsAction)
    registry.register_urls(
        "dropdowns", [path("api/dropdowns/", include("mods.dropdowns.urls"))]
    )

    # Pre-seed built-in dropdowns.
    try:
        _seed_builtin_dropdowns()
    except Exception:
        # DB not available (e.g. during makemigrations) — skip.
        # The seed will be attempted again on next boot.
        pass
