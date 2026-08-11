from rest_framework import serializers

from core.models import User

from .models import Organization, OrganizationMembership


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id", "name", "short_description", "address",
            "icon_key", "color_key",
        ]
        read_only_fields = ["id"]


class OrganizationMembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    color = serializers.CharField(source="user.color", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = [
            "id", "user", "username", "first_name", "last_name",
            "color", "role", "created_at",
        ]
        read_only_fields = ["id", "user", "created_at"]
