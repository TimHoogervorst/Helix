import logging

from django.contrib.auth.models import Group
from django.db import transaction

from rest_framework import status, views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import Folder, Project
from helix_core.actions.logger import log_action

from .models import FolderShare, Grant, Organization, OrganizationMembership, Team
from .policies import (
    accessible_project_ids,
    can as can_access,
    get_policy_matrix,
)
from .serializers import (
    FolderShareSerializer,
    GrantSerializer,
    MemberUpdateSerializer,
    OrganizationMembershipSerializer,
    OrganizationSerializer,
    ProjectSerializer,
    ProjectWithGrantsSerializer,
    TeamSerializer,
)

logger = logging.getLogger(__name__)


def _log_after_success(user, action, target_type, target_id, metadata=None):
    """Write an audit entry after a successful mutation — fail-open.

    Mirrors the fail-open behaviour of ``ActionLoggingMixin``: an audit
    write failure is logged but never blocks the operation.
    """
    try:
        log_action(
            user=user,
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata=metadata,
        )
    except Exception:
        logger.exception("Action logging failed for %s", action)


def _grant_metadata(grant):
    return {
        "project": grant.project_id,
        "grantee_type": "user" if grant.user_id else "team",
        "grantee_id": grant.user_id or grant.team_id,
        "grantee_name": grant.user.username if grant.user_id else grant.team.name,
        "role": grant.role,
    }


def _share_metadata(share):
    return {
        "source_folder": share.source_folder_id,
        "source_folder_path": share.source_folder.path,
        "target_project": share.target_project_id,
        "target_project_name": share.target_project.name,
        "level": share.level,
    }


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
        _log_after_success(
            request.user,
            action="access.organization.edited",
            target_type="access.organization",
            target_id=org.id,
            metadata={"name": org.name},
        )
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
        _log_after_success(
            request.user,
            action="access.team.created",
            target_type="access.team",
            target_id=team.id,
            metadata={"name": team.name},
        )
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
        _log_after_success(
            request.user,
            action="access.team.edited",
            target_type="access.team",
            target_id=team.id,
            metadata={"name": team.name},
        )
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
        team_id = team.pk
        team_name = team.name
        group = team.group
        team.delete()
        group.delete()
        _log_after_success(
            request.user,
            action="access.team.deleted",
            target_type="access.team",
            target_id=team_id,
            metadata={"name": team_name},
        )
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
        _log_after_success(
            request.user,
            action="access.team.edited",
            target_type="access.team",
            target_id=team.id,
            metadata={
                "name": team.name,
                "member_id": user.id,
                "member_username": user.username,
                "member_added": True,
            },
        )
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
        member = team.group.user_set.filter(pk=user_id).first()
        team.group.user_set.remove(user_id)
        _log_after_success(
            request.user,
            action="access.team.edited",
            target_type="access.team",
            target_id=team.id,
            metadata={
                "name": team.name,
                "member_id": user_id,
                "member_username": member.username if member else None,
                "member_added": False,
            },
        )
        return Response(TeamSerializer(team).data)


class ProjectListView(views.APIView):
    """List all Projects or create one.

    ``GET /api/access/projects/`` — every active User can list Projects.
    ``POST /api/access/projects/`` — only Organization Admins can create.
    By default archived Projects are excluded; pass ``?include_archived=1``
    to include them (intended for the Settings surface).

    Pass ``?accessible=1`` to return only Projects the viewer can actually
    access — through a direct Grant, Team Grant, or Organization Admin
    override.  Archived Projects are excluded from accessible listing.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Project.objects.order_by("name")
        include_archived = request.query_params.get("include_archived") == "1"
        accessible_only = request.query_params.get("accessible") == "1"

        if not include_archived:
            qs = qs.filter(is_archived=False)

        if accessible_only:
            qs = qs.filter(pk__in=accessible_project_ids(request.user))

        serializer = ProjectSerializer(
            qs, many=True, context={"request": request},
        )
        return Response(serializer.data)

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
        _log_after_success(
            request.user,
            action="access.project.created",
            target_type="access.project",
            target_id=project.id,
            metadata={"name": project.name},
        )
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
        _log_after_success(
            request.user,
            action="access.project.edited",
            target_type="access.project",
            target_id=project.id,
            metadata={
                "name": project.name,
                "is_archived": project.is_archived,
            },
        )
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
        project_id = project.pk
        project_name = project.name
        project.delete()
        _log_after_success(
            request.user,
            action="access.project.deleted",
            target_type="access.project",
            target_id=project_id,
            metadata={"name": project_name},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectGrantListView(views.APIView):
    """List all Grants for a Project.

    ``GET /api/access/projects/<pk>/grants/`` — Org Admins only.
    ``POST /api/access/projects/<pk>/grants/`` — Org Admins only
        (create or replace a Grant).
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
        if not can_access(request.user, "created", resource=Grant()):
            return Response(
                {"detail": "Only Organization Admins can view Grants."},
                status=status.HTTP_403_FORBIDDEN,
            )
        grants = Grant.objects.filter(project=project).select_related(
            "user", "team__group",
        ).order_by("-role", "user__username", "team__group__name")
        return Response(GrantSerializer(grants, many=True).data)

    def post(self, request, pk):
        project = self._get_project(pk)
        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "created", resource=project):
            return Response(
                {"detail": "Only Organization Admins can manage Grants."},
                status=status.HTTP_403_FORBIDDEN,
            )
        data = {
            "project": project.pk,
            "role": request.data.get("role"),
            "user": request.data.get("user"),
            "team": request.data.get("team"),
        }
        serializer = GrantSerializer(data=data, context={"request": request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        grant = serializer.save()
        action = (
            "access.grant.created"
            if getattr(grant, "_grant_was_created", True)
            else "access.grant.edited"
        )
        _log_after_success(
            request.user,
            action=action,
            target_type="access.grant",
            target_id=grant.id,
            metadata=_grant_metadata(grant),
        )
        return Response(GrantSerializer(grant).data, status=status.HTTP_201_CREATED)


class ProjectGrantDetailView(views.APIView):
    """Delete a single Grant.

    ``DELETE /api/access/projects/<project_pk>/grants/<pk>/``
        — Org Admins only.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, project_pk, pk):
        try:
            project = Project.objects.get(pk=project_pk)
        except Project.DoesNotExist:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "deleted", resource=project):
            return Response(
                {"detail": "Only Organization Admins can manage Grants."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            grant = Grant.objects.get(pk=pk, project=project)
        except Grant.DoesNotExist:
            return Response(
                {"detail": "Grant not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        grant_id = grant.pk
        metadata = _grant_metadata(grant)
        grant.delete()
        _log_after_success(
            request.user,
            action="access.grant.deleted",
            target_type="access.grant",
            target_id=grant_id,
            metadata=metadata,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class FolderShareListView(views.APIView):
    """List or create Folder Shares for a Project.

    ``GET /api/access/projects/<pk>/folder_shares/`` — Org Admins only.
    ``POST /api/access/projects/<pk>/folder_shares/`` — Org Admins only.
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
        if not can_access(request.user, "created", resource=FolderShare()):
            return Response(
                {"detail": "Only Organization Admins can view Folder Shares."},
                status=status.HTTP_403_FORBIDDEN,
            )
        shares = FolderShare.objects.filter(
            target_project=project,
        ).select_related(
            "source_folder__project", "target_project",
        ).order_by("source_folder__name")
        return Response(FolderShareSerializer(shares, many=True).data)

    def post(self, request, pk):
        project = self._get_project(pk)
        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "created", resource=FolderShare()):
            return Response(
                {"detail": "Only Organization Admins can create Folder Shares."},
                status=status.HTTP_403_FORBIDDEN,
            )
        data = {
            "source_folder": request.data.get("source_folder"),
            "target_project": project.pk,
            "level": request.data.get("level"),
        }
        serializer = FolderShareSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        share = serializer.save()
        _log_after_success(
            request.user,
            action="access.folder_share.created",
            target_type="access.folder_share",
            target_id=share.id,
            metadata=_share_metadata(share),
        )
        return Response(
            FolderShareSerializer(share).data,
            status=status.HTTP_201_CREATED,
        )


class FolderShareDetailView(views.APIView):
    """Update or delete a single Folder Share.

    ``PATCH  /api/access/folder_shares/<pk>/`` — Org Admins only (level change).
    ``DELETE /api/access/folder_shares/<pk>/`` — Org Admins only (revoke).
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            share = FolderShare.objects.get(pk=pk)
        except FolderShare.DoesNotExist:
            return Response(
                {"detail": "Folder Share not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "edited", resource=FolderShare()):
            return Response(
                {"detail": "Only Organization Admins can update Folder Shares."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = FolderShareSerializer(share, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        _log_after_success(
            request.user,
            action="access.folder_share.edited",
            target_type="access.folder_share",
            target_id=share.id,
            metadata=_share_metadata(share),
        )
        return Response(FolderShareSerializer(share).data)

    def delete(self, request, pk):
        try:
            share = FolderShare.objects.get(pk=pk)
        except FolderShare.DoesNotExist:
            return Response(
                {"detail": "Folder Share not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "deleted", resource=FolderShare()):
            return Response(
                {"detail": "Only Organization Admins can revoke Folder Shares."},
                status=status.HTTP_403_FORBIDDEN,
            )
        share_id = share.pk
        metadata = _share_metadata(share)
        share.delete()
        _log_after_success(
            request.user,
            action="access.folder_share.deleted",
            target_type="access.folder_share",
            target_id=share_id,
            metadata=metadata,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class FolderOutgoingShareListView(views.APIView):
    """List outgoing Folder Shares for a folder.

    ``GET /api/access/folders/<pk>/shares/`` — Org Admins only.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            folder = Folder.objects.get(pk=pk)
        except Folder.DoesNotExist:
            return Response(
                {"detail": "Folder not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_access(request.user, "created", resource=FolderShare()):
            return Response(
                {"detail": "Only Organization Admins can view Folder Shares."},
                status=status.HTTP_403_FORBIDDEN,
            )
        shares = FolderShare.objects.filter(
            source_folder=folder,
        ).select_related(
            "source_folder__project", "target_project",
        ).order_by("target_project__name")
        return Response(FolderShareSerializer(shares, many=True).data)
