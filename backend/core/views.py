from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Folder
from .serializers import FolderSerializer, UserRegistrationSerializer, LoginSerializer


class FolderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for folders.

    list: GET /api/core/folders/ — list root folders (parent is null)
    retrieve: GET /api/core/folders/{id}/ — get folder with children
    """

    queryset = Folder.objects.filter(parent__isnull=True)
    serializer_class = FolderSerializer
    permission_classes = []
    pagination_class = None


@api_view(["POST"])
@permission_classes([AllowAny])
def register_view(request):
    """POST /api/auth/register/ — register a new user. Returns auth token."""
    serializer = UserRegistrationSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        token = user.auth_token
        return Response(
            {"token": token.key, "user_id": user.id, "username": user.username},
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """POST /api/auth/login/ — login. Returns auth token."""
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        return Response(serializer.validated_data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
