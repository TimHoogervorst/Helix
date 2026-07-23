"""
URL configuration for Helix project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from helix_core.mod_system.registry import registry


@csrf_exempt
def delete_everything(request):
    """DELETE EVERYTHING: clears all ELN entries, entities, and schemas.

    Danger zone endpoint for testing only. Hard-deletes all data.
    Order matters — delete children before parents to respect FK constraints.
    """
    if request.method != "DELETE":
        return JsonResponse({"error": "Use DELETE method"}, status=405)

    counts: dict[str, int] = {}

    # 1. Mentions (depends on entries)
    from core.mentions.models import Mention
    c, _ = Mention.objects.all().delete()
    counts["mentions"] = c

    # 2. ELN entries
    from mods.eln.models import NotebookEntry
    c, _ = NotebookEntry.objects.all().delete()
    counts["eln_entries"] = c

    # 3. LIMS actions (depend on entities)
    from mods.lims.models import Action
    c, _ = Action.objects.all().delete()
    counts["actions"] = c

    # 4. LIMS entities (depend on entity types)
    from mods.lims.models import Entity
    c, _ = Entity.objects.all().delete()
    counts["entities"] = c

    # 5. Entity types (legacy — may already be empty)
    from mods.lims.models import EntityType
    c, _ = EntityType.objects.all().delete()
    counts["entity_types"] = c

    # 6. Schemas (new shared model — delete after entities)
    from helix_core.models import Schema
    c, _ = Schema.objects.all().delete()
    counts["schemas"] = c

    total = sum(counts.values())
    return JsonResponse({"deleted": total, "breakdown": counts})


urlpatterns = [
    path("admin/", admin.site.urls),
    # Helix mod URLs — generated from registry in dependency order
    *registry.build_urlpatterns(),
    # Core shell (non-mod endpoints: csrf, folders, settings, user auth)
    path("api/core/", include("core.urls")),
    # Mentions (cross-cutting concern)
    path("api/mentions/", include("core.mentions.urls")),
    # Schema API (helix_core shared models)
    path("api/", include("helix_core.urls")),
    # Danger zone
    path("api/delete-everything/", delete_everything, name="delete-everything"),
    # OpenAPI schema
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
