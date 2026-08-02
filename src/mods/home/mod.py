"""Backend registration for the home mod.

Called by ModLoader after topological sort.  Registers URL patterns for
the Metric Card API and pre-seeds two global cards.
"""

from django.urls import include, path

from helix_core.mod_system.registry import registry

DEFAULT_FORMATTING = {
    "rules": [],
    "default": {"color": "flask", "icon": "flask-conical", "text": None},
}

_GLOBAL_CARD_DEFS = [
    {
        "view_name": "Entries in progress, by me",
        "label": "In-progress entries",
        "icon": "scroll-text",
        "order": 0,
    },
    {
        "view_name": "Entities created, by me",
        "label": "Entities created",
        "icon": "test-tubes",
        "order": 1,
    },
]


def _seed_global_cards():
    """Pre-seed two global Metric Cards pointing at the seeded Metrics.

    Looks up the Metrics by their stable seeded identities (admin owner +
    the seeded View name) rather than hardcoding IDs.  Idempotent via
    get_or_create.
    """
    from core.models import User
    from mods.lims.models import LimsView, Metric
    from .models import Card

    admin = User.objects.filter(is_superuser=True, is_active=True).first()
    if not admin:
        return

    for card_def in _GLOBAL_CARD_DEFS:
        try:
            view = LimsView.objects.get(
                owner=admin,
                name=card_def["view_name"],
                is_public=True,
            )
        except LimsView.DoesNotExist:
            continue

        metric = Metric.objects.filter(
            owner=admin,
            view=view,
            aggregate_function="count",
            column__isnull=True,
        ).first()
        if not metric:
            continue

        Card.objects.get_or_create(
            owner=None,
            metric=metric,
            surface="home",
            defaults={
                "order": card_def["order"],
                "label": card_def["label"],
                "icon": card_def["icon"],
                "formatting": DEFAULT_FORMATTING,
            },
        )


def register():
    """Called by ModLoader after topological sort."""
    registry.register_urls(
        "home", [path("api/home/", include("mods.home.urls"))]
    )

    try:
        _seed_global_cards()
    except Exception:
        pass
