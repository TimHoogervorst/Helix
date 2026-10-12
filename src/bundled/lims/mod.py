from django.urls import include, path

from helix_core.schema_tags import RegistrationTable, ResultTable


def _seed_builtin_metrics():
    """Pre-seed two public ``is_me`` Views and their count Metrics.

    Creates one View per workspace (eln / lims) filtered to ``author:is_me``
    with status ``in_progress``, plus a ``Count`` Metric on each.  Uses
    ``get_or_create`` so repeated calls on boot are safe.
    """
    from helix_core.core.models import User
    from bundled.lims.models import LimsView, Metric

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


def register(mod):
    """Called by ModLoader after topological sort. Populates the backend registry."""
    from bundled.lims.models import Entity
    from bundled.lims.services import cascade_source_status

    entity = mod.register_model("entity", Entity)
    result_entity = mod.register_model("result-entity", "bundled.lims.models.ResultEntity")
    mod.register_source_kind("entity", entity)
    mod.register_custom_action("lims.entity.tags_attached", "Tags Attached", "edited", entity)
    mod.register_custom_action("lims.entity.tag_detached", "Tag Detached", "edited", entity)
    mod.register_urls([path("api/lims/", include("bundled.lims.urls"))])
    mod.register_service("lims.cascadeSourceStatus", cascade_source_status)

    # Register LIMS schema type identity.
    mod.register_schema_type(
        display_name="Entity",
        workspace_id="lims",
        model=entity,
        tags=[RegistrationTable],
        prefix="BLOOD",
        icon="flask-conical",
        color="success",
    )

    # Result schemas use the shared Entity persistence path but have their own
    # schema-type identity and table capability.
    mod.register_schema_type(
        display_name="Results",
        workspace_id="results",
        # Result entities share the Entity table but have their own schema
        # type identity.  Keep this registration key stable because it is
        # already persisted in SchemaType rows.
        model=result_entity,
        tags=[ResultTable],
        prefix="RESULT",
        icon="chart-column",
        color="muted",
    )

    # Pre-seed built-in Views and Metrics.
    try:
        _seed_builtin_metrics()
    except Exception:
        # DB not available (e.g. during makemigrations) — skip.
        # The seed will be attempted again on next boot.
        pass
