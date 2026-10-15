"""
URL configuration for Helix project.
"""
from django.contrib import admin
from django.urls import path, include
from django.urls import clear_url_caches
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import IsAuthenticated

from helix_core.mod_system.registry import registry
from bundled.access.access.permissions import IsOrganizationAdmin


@api_view(["DELETE"])
@permission_classes([IsOrganizationAdmin])
def delete_everything(request):
    """DELETE EVERYTHING: clears registered content, actions, and schemas.

    Danger zone endpoint for testing only. Hard-deletes all data.
    Order matters — delete children before parents to respect FK constraints.
    """
    counts: dict[str, int] = {}

    # 1. Mentions (depends on entries)
    from helix_core.mentions.models import Mention
    c, _ = Mention.objects.all().delete()
    counts["mentions"] = c

    # 2. Registered content sources (depend on mentions)
    for provider, model in registry.content_source_models():
        c, _ = model.objects.all().delete()
        counts[provider.kind.rsplit(":", 1)[-1]] = c

    # 3. LIMS actions (depend on entities)
    from bundled.lims.models import Action
    c, _ = Action.objects.all().delete()
    counts["actions"] = c

    # 4. Schemas (shared model — delete after registered content)
    from helix_core.models import Schema
    c, _ = Schema.objects.all().delete()
    counts["schemas"] = c

    total = sum(counts.values())
    return JsonResponse({"deleted": total, "breakdown": counts})


def _static_urlpatterns():
    return [
    path("admin/", admin.site.urls),
    # Core shell (non-mod endpoints: csrf, folders, settings, user auth)
    path("api/core/", include("helix_core.core.urls")),
    # Mentions (cross-cutting concern)
    path("api/mentions/", include("helix_core.mentions.urls")),
    # Schema API (helix_core shared models)
    path("api/", include("helix_core.urls")),
    # Danger zone
    path("api/delete-everything/", delete_everything, name="delete-everything"),
    # OpenAPI schema
    path("api/schema/", SpectacularAPIView.as_view(permission_classes=[IsAuthenticated]), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema", permission_classes=[IsAuthenticated]), name="swagger-ui"),
    ]


urlpatterns = [*registry.build_urlpatterns(), *_static_urlpatterns()]


def refresh_mod_urlpatterns():
    """Refresh routes after Mod registration has completed during app startup."""
    urlpatterns[:] = [*registry.build_urlpatterns(), *_static_urlpatterns()]
    clear_url_caches()
