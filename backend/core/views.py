from django.contrib.auth import login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status, views, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import CoreSetting, Folder, User
from .serializers import (
    ChangePasswordSerializer,
    CoreSettingSerializer,
    CreateUserSerializer,
    FolderSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)


@ensure_csrf_cookie
def csrf_token_view(request):
    """Return a CSRF token cookie for the SPA frontend."""
    return JsonResponse({"detail": "CSRF cookie set"})


# ── Folder ─────────────────────────────────────────────────────────────────


class FolderViewSet(viewsets.ModelViewSet):
    """
    API endpoint for folders.

    list:     GET    /api/core/folders/      — list root folders (parent is null)
    retrieve: GET    /api/core/folders/{id}/  — get folder with children
    create:   POST   /api/core/folders/       — create a folder
    update:   PUT    /api/core/folders/{id}/  — update a folder
    destroy:  DELETE /api/core/folders/{id}/  — delete a folder
    """

    queryset = Folder.objects.filter(parent__isnull=True)
    serializer_class = FolderSerializer
    pagination_class = None


# ── Auth ───────────────────────────────────────────────────────────────────


class LoginView(views.APIView):
    """POST /api/core/login/ — authenticate and create a Django session."""

    permission_classes = [AllowAny]
    authentication_classes = []

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
    """

    permission_classes = [AllowAny]
    authentication_classes = []

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
    """

    queryset = User.objects.all().order_by("-date_joined")
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return CreateUserSerializer
        return UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = CreateUserSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


# ── CoreSetting ────────────────────────────────────────────────────────────


class CoreSettingViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only list + retrieve for CoreSettings.

    list:     GET    /api/core/settings/       — list all settings
    retrieve: GET    /api/core/settings/{key}/  — get a setting by key

    Update is provided via a custom action on the list route so the key
    in the URL is the natural key, not a numeric PK.
    """

    queryset = CoreSetting.objects.all()
    serializer_class = CoreSettingSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "key"

    def partial_update(self, request, key=None):
        """PATCH /api/core/settings/{key}/ — update a setting value."""
        try:
            setting = CoreSetting.objects.get(key=key)
        except CoreSetting.DoesNotExist:
            return Response(
                {"detail": "Setting not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = CoreSettingSerializer(setting, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)
