from rest_framework import viewsets

from helix_core.actions.mixins import ActionLoggingMixin

from .models import Tag
from .serializers import TagSerializer


class TagViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    """
    API endpoint for tags.

    list:    GET  /api/tags/?q=...   — list/search tags
    create:  POST /api/tags/          — create a new tag
    retrieve: GET  /api/tags/{id}/    — retrieve a single tag
    update:  PUT  /api/tags/{id}/     — full update
    partial_update: PATCH /api/tags/{id}/ — partial update (color/icon)
    destroy: DELETE /api/tags/{id}/   — delete a tag (cascades M2M)
    """

    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    # Full CRUD — DELETE is now included (was excluded on the old ELN TagViewSet)
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    action_log_config = {
        "create": {"action": "tags.tag.created"},
        "update": {"action": "tags.tag.edited"},
        "partial_update": {"action": "tags.tag.edited"},
        "destroy": {"action": "tags.tag.deleted"},
    }

    def get_queryset(self):
        qs = super().get_queryset()
        query = self.request.query_params.get("q", "").strip()
        if query:
            qs = qs.filter(name__icontains=query)
        return qs
