"""
API views for inline mention resolution and search.
"""
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .prefix_resolver import (
    get_icon,
    get_model_type_map,
    get_prefix_map,
    get_workspace_id,
    resolve_display_id,
)


def _build_result(instance, model_type: str, workspace_id: str | None, *, include_id: bool = False) -> dict:
    """Build the common result dict shape shared by resolve and search."""
    result = {
        "display_id": getattr(instance, "display_id", str(instance.pk)),
        "title": getattr(instance, "title", getattr(instance, "name", str(instance))),
        "type": model_type,
        "icon": get_icon(instance, model_type),
        "workspaceId": workspace_id,
    }
    if include_id:
        result["id"] = instance.pk
    return result


@api_view(["POST"])
@authentication_classes([])  # No SessionAuthentication → no DRF CSRF check
@permission_classes([AllowAny])
def resolve_view(request):
    """
    Batch-resolve display IDs to target details.

    POST /api/mentions/resolve/
    Body: {"ids": ["E1", "BLOOD1"]}
    Returns: {"E1": {...}, "BLOOD1": {...}, "NONEXIST": null}

    CSRF is skipped via @csrf_exempt on the module-level wrapper below.
    DRF's SessionAuthentication.enforce_csrf() would otherwise re-check
    CSRF with view_func=None, ignoring @csrf_exempt. We avoid that by
    setting authentication_classes=[] on this read-only endpoint.
    """
    ids = request.data.get("ids", [])
    model_type_map = get_model_type_map()
    result = {}
    for display_id in ids:
        # Extract the prefix (leading letters) for workspace lookup.
        prefix = ""
        for char in display_id:
            if char.isalpha():
                prefix += char
            else:
                break

        resolved = resolve_display_id(display_id)
        if resolved:
            instance, ct = resolved
            model_type = model_type_map.get(type(instance), ct.model)
            result[display_id] = _build_result(
                instance, model_type,
                get_workspace_id(prefix) if prefix else None,
                include_id=True,
            )
        else:
            result[display_id] = None
    return Response(result)


# Wrap with csrf_exempt AFTER api_view so Django's CsrfViewMiddleware sees it.
# (api_view wraps the function first, then csrf_exempt wraps that.)
resolve_view = csrf_exempt(resolve_view)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def search_view(request):
    """
    Search for mentions by display_id prefix.

    GET /api/mentions/search/?q=E1
    Returns: {"results": [{"display_id": "E1", "title": "...", "type": "entry"}, ...]}
    """
    query = request.query_params.get("q", "").strip()
    if not query:
        return Response({"results": []})

    pmap = get_prefix_map()
    model_type_map = get_model_type_map()

    results = []
    for prefix, model in pmap.items():
        qs = model.objects.filter(display_id__istartswith=query)
        for instance in qs:
            model_type = model_type_map.get(type(instance), "entry")
            results.append(_build_result(instance, model_type, get_workspace_id(prefix)))

    return Response({"results": results})
