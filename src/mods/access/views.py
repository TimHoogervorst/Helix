from django.contrib.auth.models import Group
from django.db import transaction

from rest_framework import status, views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import Folder, Project

from .models import Organization, OrganizationMembership, Team
from .policies import can as can_access, get_policy_matrix
from .serializers import (
    MemberUpdateSerializer,
    OrganizationMembershipSerializer,
    OrganizationSerializer,
    ProjectSerializer,
    TeamSerializer,
)


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
        org = Organization.objects.first()
        if org is None:
            return Response(
                {"detail": "No Organization exists."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "edited", resource=org):
            return Response(
                {"detail": "Only Organization Admins can edit organization details."},
                status=status.HTTP_403_FORBIDDEN,
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


class PolicyView(views.APIView):
    """Expose the hardcoded Core Action policy matrix.

    ``GET /api/access/policies/`` returns the authorization matrix as a
    list of policy entries.  Every active User can read it.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(get_policy_matrix())


class TeamListView(views.APIView):
    """List all Teams.

    ``GET /api/access/teams/`` — every active User can read Teams.
    ``POST /api/access/teams/`` — only Organization Admins can create.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        teams = Team.objects.select_related("group", "organization").order_by(
            "group__name"
        )
        return Response(TeamSerializer(teams, many=True).data)

    def post(self, request):
        if not can_access(request.user, "created", resource=Team()):
            return Response(
                {"detail": "Only Organization Admins can create Teams."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = TeamSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        team = serializer.save()
        return Response(TeamSerializer(team).data, status=status.HTTP_201_CREATED)


class TeamDetailView(views.APIView):
    """Retrieve, update, or delete a single Team.

    ``GET`` — all active Users.
    ``PATCH`` — Organization Admins only.
    ``DELETE`` — Organization Admins only; blocked when Grants reference it.
    """

    permission_classes = [IsAuthenticated]

    def _get_team(self, pk):
        try:
            return Team.objects.select_related("group", "organization").get(pk=pk)
        except Team.DoesNotExist:
            return None

    def get(self, request, pk):
        team = self._get_team(pk)
        if team is None:
            return Response(
                {"detail": "Team not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(TeamSerializer(team).data)

    def patch(self, request, pk):
        team = self._get_team(pk)
        if team is None:
            return Response(
                {"detail": "Team not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "edited", resource=team):
            return Response(
                {"detail": "Only Organization Admins can edit Teams."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = TeamSerializer(team, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(TeamSerializer(team).data)

    def delete(self, request, pk):
        team = self._get_team(pk)
        if team is None:
            return Response(
                {"detail": "Team not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "deleted", resource=team):
            return Response(
                {"detail": "Only Organization Admins can delete Teams."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if team.blocked_from_deletion:
            return Response(
                {"detail": "Cannot delete a Team that is referenced by Grants."},
                status=status.HTTP_409_CONFLICT,
            )
        team.group.delete()
        team.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMemberAddView(views.APIView):
    """Add a User to a Team.

    ``POST /api/access/teams/<pk>/add_member/`` — Organization Admins only.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            team = Team.objects.select_related("group").get(pk=pk)
        except Team.DoesNotExist:
            return Response(
                {"detail": "Team not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "edited", resource=team):
            return Response(
                {"detail": "Only Organization Admins can change Team membership."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = MemberUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user_id = serializer.validated_data["user_id"]
        try:
            from core.models import User
            user = User.objects.get(pk=user_id, is_active=True)
        except User.DoesNotExist:
            return Response(
                {"detail": "Active User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        team.group.user_set.add(user)
        return Response(TeamSerializer(team).data)


class TeamMemberRemoveView(views.APIView):
    """Remove a User from a Team.

    ``POST /api/access/teams/<pk>/remove_member/`` — Organization Admins only.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            team = Team.objects.select_related("group").get(pk=pk)
        except Team.DoesNotExist:
            return Response(
                {"detail": "Team not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "edited", resource=team):
            return Response(
                {"detail": "Only Organization Admins can change Team membership."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = MemberUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user_id = serializer.validated_data["user_id"]
        team.group.user_set.remove(user_id)
        return Response(TeamSerializer(team).data)


class ProjectListView(views.APIView):
    """List all Projects or create one.

    ``GET /api/access/projects/`` — every active User can list Projects.
    ``POST /api/access/projects/`` — only Organization Admins can create.
    By default archived Projects are excluded; pass ``?include_archived=1``
    to include them (intended for the Settings surface).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Project.objects.order_by("name")
        include_archived = request.query_params.get("include_archived") == "1"
        if not include_archived:
            qs = qs.filter(is_archived=False)
        return Response(ProjectSerializer(qs, many=True).data)

    def post(self, request):
        if not can_access(request.user, "created", resource=Project()):
            return Response(
                {"detail": "Only Organization Admins can create Projects."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ProjectSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        project = serializer.save()
        return Response(
            ProjectSerializer(project).data,
            status=status.HTTP_201_CREATED,
        )


class ProjectDetailView(views.APIView):
    """Retrieve, update, or archive/restore a single Project.

    ``GET`` — all active Users.
    ``PATCH`` — Organization Admins only (rename, recolor, re-icon,
               archive, restore).
    ``DELETE`` — Organization Admins only.
    """

    permission_classes = [IsAuthenticated]

    def _get_project(self, pk):
        try:
            return Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            return None

    def get(self, request, pk):
        project = self._get_project(pk)
        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(ProjectSerializer(project).data)

    def patch(self, request, pk):
        project = self._get_project(pk)
        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "edited", resource=project):
            return Response(
                {"detail": "Only Organization Admins can edit Projects."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ProjectSerializer(project, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(ProjectSerializer(project).data)

    @transaction.atomic
    def delete(self, request, pk):
        project = self._get_project(pk)
        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "deleted", resource=project):
            return Response(
                {"detail": "Only Organization Admins can delete Projects."},
                status=status.HTTP_403_FORBIDDEN,
            )
        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
