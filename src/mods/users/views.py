"""Views for the users core-mod.

Auth views and UserViewSet that were previously in core.views.
"""
import logging

from django.contrib.auth import login, logout
from rest_framework import status, views, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from helix_core.actions.logger import log_action
from core.models import CoreSetting, User
from mods.access.policies import can as can_access

from .models import Affiliation, Publication, Recognition
from .serializers import (
    AffiliationSerializer,
    ChangePasswordSerializer,
    CreateUserSerializer,
    LoginSerializer,
    PublicationSerializer,
    RecognitionSerializer,
    RegisterSerializer,
    UserAdminSerializer,
    UserSerializer,
)

logger = logging.getLogger(__name__)


def _log_user_after_success(user, action, target_id, metadata=None):
    """Write a user-management audit entry — fail-open."""
    try:
        log_action(
            user=user,
            action=action,
            target_type="core.user",
            target_id=target_id,
            metadata=metadata,
        )
    except Exception:
        logger.exception("Action logging failed for %s", action)


# ── Auth ───────────────────────────────────────────────────────────────────


class LoginView(views.APIView):
    """POST /api/core/login/ — authenticate and create a Django session.

    Rate-limited to 5 requests per minute per IP.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.validated_data["user"]
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(views.APIView):
    """POST /api/core/logout/ — clear the Django session."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out."})


class RegisterView(views.APIView):
    """POST /api/core/register/ — create a new user account.

    Gated by CoreSetting.allow_self_registration.  Returns 403 when
    self-registration is disabled.

    Rate-limited to 5 requests per minute per IP.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        # Gate: check CoreSetting
        try:
            setting = CoreSetting.objects.get(key="allow_self_registration")
            if not setting.value:
                return Response(
                    {"detail": "Self-registration is disabled."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except CoreSetting.DoesNotExist:
            return Response(
                {"detail": "Self-registration is disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.save()
        login(request, user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class MeView(views.APIView):
    """GET/PATCH /api/core/me/ — retrieve or update the current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(views.APIView):
    """POST /api/core/me/change-password/ — change the current user's password."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response({"detail": "Password changed."})


# ── User management (admin settings) ───────────────────────────────────────


class UserViewSet(viewsets.ModelViewSet):
    """CRUD for user management in settings.

    list:     GET    /api/core/users/      — list all users
    create:   POST   /api/core/users/      — create a user
    retrieve: GET    /api/core/users/{id}/  — get a user
    update:   PUT    /api/core/users/{id}/  — update a user
    partial_update: PATCH /api/core/users/{id}/ — partial update (e.g. deactivate)
    destroy:  DELETE /api/core/users/{id}/  — delete a user

    All actions are restricted to Organization Admins.
    """

    queryset = User.objects.all().order_by("-date_joined")
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # Gate against an Organization-administration category resource —
        # a resource-less check would resolve to "public" and pass for
        # every authenticated user.
        from mods.access.models import Organization
        if not can_access(request.user, "edited", resource=Organization()):
            self.permission_denied(
                request,
                message="Only Organization Admins can manage users.",
            )

    def get_serializer_class(self):
        if self.action == "create":
            return CreateUserSerializer
        if self.action in ("update", "partial_update"):
            return UserAdminSerializer
        return UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = CreateUserSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.save()
        _log_user_after_success(
            request.user,
            action="core.user.created",
            target_id=user.id,
            metadata={"username": user.username},
        )
        headers = self.get_success_headers(serializer.data)
        return Response(
            UserSerializer(user).data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    def perform_update(self, serializer):
        """Log user edits; deactivation logs the dedicated action."""
        was_active = serializer.instance.is_active
        instance = serializer.save()
        if (
            was_active
            and "is_active" in serializer.validated_data
            and not instance.is_active
        ):
            _log_user_after_success(
                self.request.user,
                action="core.user.deactivated",
                target_id=instance.id,
                metadata={"username": instance.username},
            )
        else:
            _log_user_after_success(
                self.request.user,
                action="core.user.edited",
                target_id=instance.id,
                metadata={"username": instance.username},
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        target_id = instance.pk
        username = instance.username
        response = super().destroy(request, *args, **kwargs)
        _log_user_after_success(
            request.user,
            action="core.user.deleted",
            target_id=target_id,
            metadata={"username": username},
        )
        return response


# ── Profile list viewsets (scoped to request.user) ──────────────────────────


class _BaseUserScopedViewSet(viewsets.ModelViewSet):
    """Base viewset that scopes queryset to request.user and sets user on create."""

    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class AffiliationViewSet(_BaseUserScopedViewSet):
    """CRUD for the current user's affiliations.

    list:           GET    /api/core/me/affiliations/
    create:         POST   /api/core/me/affiliations/
    partial_update: PATCH  /api/core/me/affiliations/:id/
    destroy:        DELETE /api/core/me/affiliations/:id/
    """

    queryset = Affiliation.objects.all()
    serializer_class = AffiliationSerializer


class PublicationViewSet(_BaseUserScopedViewSet):
    """CRUD for the current user's publications.

    list:           GET    /api/core/me/publications/
    create:         POST   /api/core/me/publications/
    partial_update: PATCH  /api/core/me/publications/:id/
    destroy:        DELETE /api/core/me/publications/:id/
    """

    queryset = Publication.objects.all()
    serializer_class = PublicationSerializer


class RecognitionViewSet(_BaseUserScopedViewSet):
    """CRUD for the current user's recognitions.

    list:           GET    /api/core/me/recognitions/
    create:         POST   /api/core/me/recognitions/
    partial_update: PATCH  /api/core/me/recognitions/:id/
    destroy:        DELETE /api/core/me/recognitions/:id/
    """

    queryset = Recognition.objects.all()
    serializer_class = RecognitionSerializer
