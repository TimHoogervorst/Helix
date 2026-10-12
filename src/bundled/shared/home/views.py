from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Card
from .serializers import CardSerializer


class CardViewSet(viewsets.ModelViewSet):
    """API endpoint for Metric Cards.

    list:    GET    /api/home/cards/?surface=home
    create:  POST   /api/home/cards/
    retrieve: GET   /api/home/cards/{id}/
    update:  PUT    /api/home/cards/{id}/
    partial_update: PATCH /api/home/cards/{id}/
    destroy: DELETE /api/home/cards/{id}/
    fork:    POST   /api/home/cards/{id}/fork/
    """

    serializer_class = CardSerializer
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        surface = self.request.query_params.get("surface")

        global_cards_q = Q(owner__isnull=True)
        if user.is_authenticated:
            personal_cards_q = Q(owner=user)
            qs = Card.objects.filter(global_cards_q | personal_cards_q)
        else:
            qs = Card.objects.filter(global_cards_q)

        if surface:
            qs = qs.filter(surface=surface)

        return qs.select_related("owner", "metric").distinct()

    def perform_create(self, serializer):
        if not self.request.user.is_authenticated:
            from rest_framework.exceptions import NotAuthenticated

            raise NotAuthenticated("Authentication is required to create cards.")
        serializer.save(owner=self.request.user)

    def check_object_permissions(self, request, obj):
        if request.method in ("PUT", "PATCH", "DELETE") and obj.is_global:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Cannot modify a global card.")
        return super().check_object_permissions(request, obj)

    @action(detail=True, methods=["post"])
    def fork(self, request, pk=None):
        """Fork a global card into a personal copy owned by the caller.

        POST /api/home/cards/{id}/fork/

        Copies label, icon, formatting, metric, and surface from the source
        card.  The source is untouched.
        """
        if not request.user.is_authenticated:
            from rest_framework.exceptions import NotAuthenticated

            raise NotAuthenticated("Authentication is required to fork a card.")

        source = self.get_object()

        forked = Card.objects.create(
            owner=request.user,
            metric=source.metric,
            surface=source.surface,
            order=source.order,
            label=source.label,
            icon=source.icon,
            formatting=source.formatting,
        )
        serializer = self.get_serializer(forked)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
