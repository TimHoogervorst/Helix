"""
API views for inline mention resolution and search.
"""
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from mods.access.scoping import visible_rows_q

from .prefix_resolver import (
    get_color,
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
        "color": get_color(instance, model_type),
        "workspaceId": workspace_id,
    }
    if include_id:
        result["id"] = instance.pk
    return result


def _is_visible(instance, user) -> bool:
    """Check visibility without assuming a concrete mention target type."""
    field_names = {field.name for field in instance._meta.get_fields()}
    if not {"project", "folder"}.issubset(field_names):
        return False
    return type(instance).objects.filter(
        pk=instance.pk,
    ).filter(visible_rows_q(user)).exists()


@api_view(["POST"])
def resolve_view(request):
    """
    Batch-resolve display IDs to target details.

    POST /api/mentions/resolve/
    Body: {"ids": ["E1", "BLOOD1"]}
    Returns: {"E1": {...}, "BLOOD1": {...}, "NONEXIST": null}
    """
    ids = request.data.get("ids", [])
    model_type_map = get_model_type_map()
    result = {}
    for display_id in ids:
        prefix = ""
        for char in display_id:
            if char.isalpha():
                prefix += char
            else:
                break

        resolved = resolve_display_id(display_id)
        if resolved and _is_visible(resolved[0], request.user):
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


@api_view(["GET"])
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
        if {field.name for field in model._meta.get_fields()}.issuperset(
            {"project", "folder"}
        ):
            qs = qs.filter(visible_rows_q(request.user))
        else:
            qs = qs.none()
        for instance in qs:
            model_type = model_type_map.get(type(instance), "entry")
            results.append(_build_result(instance, model_type, get_workspace_id(prefix)))

    return Response({"results": results})
