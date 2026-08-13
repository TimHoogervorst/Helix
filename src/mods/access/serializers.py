from django.contrib.auth.models import Group
from django.db import transaction

from rest_framework import serializers

from core.models import Folder, Project, User

from .models import FolderShare, Grant, Organization, OrganizationMembership, Team


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
    current_user_role = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id", "uid", "name", "icon_key", "color_key",
            "is_archived", "created_at", "current_user_role",
        ]
        read_only_fields = ["id", "uid", "created_at", "current_user_role"]

    def get_current_user_role(self, obj):
        request = self.context.get("request")
        if request is None:
            return None
        with_role = request.query_params.get("with_role") == "1"
        if not with_role:
            return None
        from .policies import role
        if role(request.user) is not None:
            return None
        return role(request.user, obj)

    @transaction.atomic
    def create(self, validated_data):
        return Project.objects.create(**validated_data)


class GrantSerializer(serializers.ModelSerializer):
    grantee_type = serializers.SerializerMethodField()
    grantee_name = serializers.SerializerMethodField()

    class Meta:
        model = Grant
        fields = [
            "id", "project", "role", "user", "team",
            "grantee_type", "grantee_name",
        ]
        read_only_fields = ["id"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for name in ("user", "team"):
            if name in self.fields:
                self.fields[name].required = False
                self.fields[name].allow_null = True

    def run_validators(self, value):
        return value

    def get_grantee_type(self, obj):
        if obj.user_id:
            return "user"
        if obj.team_id:
            return "team"
        return None

    def get_grantee_name(self, obj):
        if obj.user_id:
            return obj.user.username
        if obj.team_id:
            return obj.team.name
        return None

    def validate(self, data):
        user = data.get("user")
        team = data.get("team")
        if user and team:
            raise serializers.ValidationError(
                "A Grant must reference exactly one grantee (User or Team)."
            )
        if not user and not team:
            raise serializers.ValidationError(
                "A Grant must reference a User or a Team."
            )
        return data

    def create(self, validated_data):
        project = validated_data["project"]
        user = validated_data.get("user")
        team = validated_data.get("team")
        role = validated_data["role"]

        if user:
            grant, created = Grant.objects.update_or_create(
                project=project,
                user=user,
                defaults={"role": role},
            )
        else:
            grant, created = Grant.objects.update_or_create(
                project=project,
                team=team,
                defaults={"role": role},
            )
        # Distinguish a fresh Grant from a role change (upsert) so the
        # audit trail can log "created" vs "edited".
        grant._grant_was_created = created
        return grant


class ProjectWithGrantsSerializer(serializers.ModelSerializer):
    grants = GrantSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = [
            "id", "uid", "name", "icon_key", "color_key",
            "is_archived", "created_at", "grants",
        ]
        read_only_fields = ["id", "uid", "created_at"]


class FolderShareSerializer(serializers.ModelSerializer):
    source_folder_name = serializers.CharField(source="source_folder.name", read_only=True)
    source_folder_path = serializers.CharField(source="source_folder.path", read_only=True)
    source_project_id = serializers.IntegerField(source="source_folder.project_id", read_only=True)
    source_project_name = serializers.SerializerMethodField()
    target_project_name = serializers.CharField(source="target_project.name", read_only=True)

    class Meta:
        model = FolderShare
        fields = [
            "id", "source_folder", "source_folder_name", "source_folder_path",
            "source_project_id", "source_project_name",
            "target_project", "target_project_name", "level",
        ]
        read_only_fields = ["id"]

    def get_source_project_name(self, obj):
        if obj.source_folder_id and obj.source_folder.project_id:
            return obj.source_folder.project.name
        return None

    def validate(self, data):
        instance = FolderShare(**data)
        instance.clean()
        return data
