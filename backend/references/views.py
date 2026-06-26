"""
API views for inline reference resolution and search.
"""
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .services import (
    _get_dynamic_prefix_map,
    _get_dynamic_model_type_map,
    _get_icon,
    resolve_display_id,
)


@api_view(["POST"])
def resolve_view(request):
    """
    Batch-resolve display IDs to target details.

    POST /api/references/resolve/
    Body: {"ids": ["E1", "BLOOD1"]}
    Returns: {"E1": {...}, "BLOOD1": {...}, "NONEXIST": null}
    """
    ids = request.data.get("ids", [])
    model_type_map = _get_dynamic_model_type_map()
    result = {}
    for display_id in ids:
        resolved = resolve_display_id(display_id)
        if resolved:
            instance, ct = resolved
            model_type = model_type_map.get(type(instance), ct.model)
            result[display_id] = {
                "id": instance.pk,
                "display_id": getattr(instance, "display_id", str(instance.pk)),
                "title": getattr(instance, "title", getattr(instance, "name", str(instance))),
                "type": model_type,
                "icon": _get_icon(instance, model_type),
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

    pmap = _get_dynamic_prefix_map()
    model_type_map = _get_dynamic_model_type_map()

    results = []
    for prefix, model in pmap.items():
        qs = model.objects.filter(display_id__istartswith=query)
        for instance in qs:
            model_type = model_type_map.get(type(instance), "entry")
            results.append({
                "display_id": instance.display_id,
                "title": getattr(instance, "title", getattr(instance, "name", str(instance))),
                "type": model_type,
                "icon": _get_icon(instance, model_type),
            })

    return Response({"results": results})
