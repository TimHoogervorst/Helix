"""Serializers for the users core-mod.

User/auth serializers that were previously in core.serializers.
"""
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from core.models import User

from mods.access.models import OrganizationMembership
from .models import Affiliation, Publication, Recognition


# ── Profile list serializers ────────────────────────────────────────────────


class AffiliationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Affiliation
        fields = [
            "id", "institution", "role", "department",
            "start_date", "end_date", "order",
        ]
        read_only_fields = ["id"]


class PublicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Publication
        fields = ["id", "title", "journal", "year", "role", "url", "order"]
        read_only_fields = ["id"]


class RecognitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recognition
        fields = ["id", "title", "issuer", "date", "order"]
        read_only_fields = ["id"]


# ── User / auth serializers ─────────────────────────────────────────────────


class UserSerializer(serializers.ModelSerializer):
    """Public user representation returned by /me/, /users/, etc."""

    affiliations = AffiliationSerializer(many=True, read_only=True)
    publications = PublicationSerializer(many=True, read_only=True)
    recognitions = RecognitionSerializer(many=True, read_only=True)
    organization_role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "color",
            "is_active", "date_joined", "profile",
            "affiliations", "publications", "recognitions",
            "organization_role",
        ]
        read_only_fields = [
            "id", "color", "date_joined", "is_active",
            "affiliations", "publications", "recognitions",
            "organization_role",
        ]

    def get_organization_role(self, obj):
        try:
            return obj.organization_membership.role
        except OrganizationMembership.DoesNotExist:
            return None


class UserAdminSerializer(UserSerializer):
    """User serializer for admin user management — allows writing is_active."""

    class Meta(UserSerializer.Meta):
        read_only_fields = [
            "id", "color", "date_joined",
            "affiliations", "publications", "recognitions",
        ]


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["username"],
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError("Invalid username or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account is deactivated.")
        attrs["user"] = user
        return attrs


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=150)
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with that username already exists.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with that email already exists.")
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            is_staff=True,  # All users are admins for now (decision #5)
        )


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, style={"input_type": "password"})
    new_password = serializers.CharField(write_only=True, style={"input_type": "password"})
    confirm_password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        validate_password(attrs["new_password"], self.context["request"].user)
        return attrs

    def save(self):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save()
        return user


class CreateUserSerializer(serializers.Serializer):
    """Used by admin settings to create a new user."""

    username = serializers.CharField(min_length=3, max_length=150)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with that username already exists.")
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            is_staff=True,
        )
