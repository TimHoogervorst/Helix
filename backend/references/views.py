"""
API views for inline reference resolution and search.
"""
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .services import PREFIX_MAP, MODEL_TYPE_MAP, resolve_display_id


@api_view(["POST"])
def resolve_view(request):
    """
    Batch-resolve display IDs to target details.

    POST /api/references/resolve/
    Body: {"ids": ["E1", "E2"]}
    Returns: {"E1": {...}, "E2": null}
    """
    ids = request.data.get("ids", [])
    result = {}
    for display_id in ids:
        resolved = resolve_display_id(display_id)
        if resolved:
            instance, ct = resolved
            result[display_id] = {
                "id": instance.pk,
                "display_id": getattr(instance, "display_id", str(instance.pk)),
                "title": getattr(instance, "title", str(instance)),
                "type": MODEL_TYPE_MAP.get(type(instance), ct.model),
            }
        else:
            result[display_id] = None
    return Response(result)


@api_view(["GET"])
def search_view(request):
    """
    Search for references by display_id prefix.

    GET /api/references/search/?q=E1
    Returns: {"results": [{"display_id": "E1", "title": "...", "type": "entry"}, ...]}
    """
    query = request.query_params.get("q", "").strip()
    if not query:
        return Response({"results": []})

    results = []
    for prefix, model in PREFIX_MAP.items():
        qs = model.objects.filter(display_id__istartswith=query)
        for instance in qs:
            results.append({
                "display_id": instance.display_id,
                "title": instance.title,
                "type": MODEL_TYPE_MAP.get(type(instance), "entry"),
            })

    return Response({"results": results})
