"""
URL configuration for OpenScience project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


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
    from workspaces.eln.models import Mention
    c, _ = Mention.objects.all().delete()
    counts["mentions"] = c

    # 2. ELN entries
    from workspaces.eln.models import NotebookEntry
    c, _ = NotebookEntry.objects.all().delete()
    counts["eln_entries"] = c

    # 3. LIMS actions (depend on entities)
    from workspaces.lims.models import Action
    c, _ = Action.objects.all().delete()
    counts["actions"] = c

    # 4. LIMS entities (depend on entity types)
    from workspaces.lims.models import Entity
    c, _ = Entity.objects.all().delete()
    counts["entities"] = c

    # 5. Entity types (schemas)
    from workspaces.lims.models import EntityType
    c, _ = EntityType.objects.all().delete()
    counts["entity_types"] = c

    total = sum(counts.values())
    return JsonResponse({"deleted": total, "breakdown": counts})


urlpatterns = [
    path("admin/", admin.site.urls),
    # API
    path("api/eln/", include("workspaces.eln.urls")),
    path("api/lims/", include("workspaces.lims.urls")),
    path("api/core/", include("core.urls")),
    path("api/library/", include("console.library.urls")),
    path("api/references/", include("references.urls")),
    # Danger zone
    path("api/delete-everything/", delete_everything, name="delete-everything"),
    # OpenAPI schema
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
