from django.urls import include, path

from helix_core.mod_system.registry import registry


def _seed_builtin_metrics():
    """Pre-seed two public ``is_me`` Views and their count Metrics.

    Creates one View per workspace (eln / lims) filtered to ``author:is_me``
    with status ``in_progress``, plus a ``Count`` Metric on each.  Uses
    ``get_or_create`` so repeated calls on boot are safe.
    """
    from core.models import User
    from mods.lims.models import LimsView, Metric

    admin = User.objects.filter(is_superuser=True, is_active=True).first()
    if not admin:
        return

    _VIEW_DEFS = [
        {
            "workspace": "eln",
            "schema_type": "eln.notebookentry",
            "name": "Entries in progress, by me",
        },
        {
            "workspace": "lims",
            "schema_type": "lims.entity",
            "name": "Entities created, by me",
        },
    ]

    for vdef in _VIEW_DEFS:
        view, _ = LimsView.objects.get_or_create(
            owner=admin,
            name=vdef["name"],
            is_public=True,
            defaults={
                "filter_state": {
                    "search": "",
                    "schema_type": vdef["schema_type"],
                    "schema": "",
                    "status": "in_progress",
                    "sort": "",
                    "fields": [],
                    "columns": [
                        {"column": "author", "operator": "is_me", "value": ""}
                    ],
                    "viewMode": "list",
                },
            },
        )
        Metric.objects.get_or_create(
            owner=admin,
            view=view,
            aggregate_function="count",
            column=None,
            defaults={
                "name": f"Count — {view.name}",
            },
        )


def register():
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from mods.lims.models import Action
    from mods.lims.services import cascade_entry_status

    registry.register_action_model("lims", Action)
    registry.register_urls(
        "lims", [path("api/lims/", include("mods.lims.urls"))]
    )
    registry.register_service(
        "lims.cascadeEntryStatus", cascade_entry_status
    )

    # Register LIMS schema type identity.
    registry.register_schema_type(
        display_name="Entity",
        workspace_id="lims",
        model="mods.lims.models.Entity",
        prefix="BLOOD",
        icon="flask-conical",
        color="success",
    )

    # Pre-seed built-in Views and Metrics.
    try:
        _seed_builtin_metrics()
    except Exception:
        # DB not available (e.g. during makemigrations) — skip.
        # The seed will be attempted again on next boot.
        pass
