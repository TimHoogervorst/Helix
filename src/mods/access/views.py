from rest_framework import status, views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Organization, OrganizationMembership, OrganizationRole
from .serializers import OrganizationMembershipSerializer, OrganizationSerializer


def _is_admin(user) -> bool:
    if not user.is_authenticated:
        return False
    return OrganizationMembership.objects.filter(
        user=user,
        role=OrganizationRole.ADMIN,
        user__is_active=True,
    ).exists()


class OrganizationView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org = Organization.objects.first()
        if org is None:
            return Response(
                {"detail": "No Organization exists."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(OrganizationSerializer(org).data)

    def patch(self, request):
        if not _is_admin(request.user):
            return Response(
                {"detail": "Only Organization Admins can edit organization details."},
                status=status.HTTP_403_FORBIDDEN,
            )
        org = Organization.objects.first()
        if org is None:
            return Response(
                {"detail": "No Organization exists."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = OrganizationSerializer(org, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)


class PeopleView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = OrganizationMembership.objects.filter(
            user__is_active=True,
        ).select_related("user").order_by("user__username")
        serializer = OrganizationMembershipSerializer(memberships, many=True)
        return Response(serializer.data)
