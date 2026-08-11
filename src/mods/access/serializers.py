from django.contrib.auth.models import Group
from django.db import transaction

from rest_framework import serializers

from core.models import Folder, Project, User

from .models import Organization, OrganizationMembership, Team


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


class TeamMemberSerializer(serializers.Serializer):
    """Lightweight member entry for team read/write payloads."""

    id = serializers.IntegerField()
    username = serializers.CharField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    color = serializers.CharField(read_only=True)


class TeamSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="group.name")
    members = serializers.SerializerMethodField()
    blocked_from_deletion = serializers.BooleanField(read_only=True)

    class Meta:
        model = Team
        fields = [
            "id", "name", "icon_key", "color_key",
            "members", "blocked_from_deletion",
        ]
        read_only_fields = ["id", "members", "blocked_from_deletion"]

    def get_members(self, obj):
        if not obj.group_id:
            return []
        users = obj.group.user_set.filter(is_active=True).order_by("username")
        return [
            {
                "id": u.pk,
                "username": u.username,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "color": u.color,
            }
            for u in users
        ]

    def create(self, validated_data):
        group_data = validated_data.pop("group")
        group = Group.objects.create(name=group_data["name"])
        organization = Organization.objects.first()
        team = Team.objects.create(
            group=group,
            organization=organization,
            **validated_data,
        )
        return team

    def update(self, instance, validated_data):
        group_data = validated_data.pop("group", None)
        if group_data and "name" in group_data:
            instance.group.name = group_data["name"]
            instance.group.save(update_fields=["name"])

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save(update_fields=list(validated_data.keys()))
        return instance


class TeamCreateSerializer(TeamSerializer):
    name = serializers.CharField(source="group.name")

    class Meta(TeamSerializer.Meta):
        fields = ["id", "name", "icon_key", "color_key", "members", "blocked_from_deletion"]
        read_only_fields = ["id", "members", "blocked_from_deletion"]


class MemberUpdateSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = [
            "id", "uid", "name", "icon_key", "color_key",
            "is_archived", "created_at",
        ]
        read_only_fields = ["id", "uid", "created_at"]

    @transaction.atomic
    def create(self, validated_data):
        project = Project.objects.create(**validated_data)
        Folder.objects.create(
            name="root",
            parent=None,
            project=project,
        )
        return project
