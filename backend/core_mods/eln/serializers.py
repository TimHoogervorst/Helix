from rest_framework import serializers

from core.models import Folder, User
from core.serializers import UserSerializer

from .models import NotebookEntry, Mention, Tag, ElnAction


def validate_tiptap_json(value):
    """Validate that content conforms to a TipTap/ProseMirror document shape."""
    if not isinstance(value, dict):
        raise serializers.ValidationError("Content must be a JSON object.")
    if value.get("type") != "doc":
        raise serializers.ValidationError(
            "Content must be a TipTap document with type='doc'."
        )
    if "content" not in value:
        raise serializers.ValidationError(
            "Content must have a 'content' array."
        )
    return value


class MentionSerializer(serializers.ModelSerializer):
    source_type_name = serializers.CharField(source="source_type.model", read_only=True)
    target_type_name = serializers.CharField(source="target_type.model", read_only=True)
    target_display_id = serializers.SerializerMethodField()
    target_title = serializers.SerializerMethodField()

    class Meta:
        model = Mention
        fields = [
            "id", "source_type", "source_type_name", "source_id",
            "target_type", "target_type_name", "target_id",
            "target_display_id", "target_title",
        ]
        read_only_fields = ["id"]

    def get_target_display_id(self, obj):
        """Return the display_id of the target object if available."""
        try:
            target = obj.target
            if target and hasattr(target, "display_id"):
                return target.display_id
        except Exception:
            pass
        return None

    def get_target_title(self, obj):
        """Return the title (or name) of the target object if available."""
        try:
            target = obj.target
            if target:
                return getattr(target, "title", getattr(target, "name", str(target)))
        except Exception:
            pass
        return None


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "color", "icon"]
        read_only_fields = ["id"]


class NotebookEntrySerializer(serializers.ModelSerializer):
    author_username = serializers.SerializerMethodField()
    author_info = UserSerializer(source="author", read_only=True)
    folder_name = serializers.CharField(source="folder.name", read_only=True)
    folder_path = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    mentions = MentionSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = NotebookEntry
        fields = [
            "id",
            "display_id",
            "title",
            "content",
            "folder",
            "folder_name",
            "folder_path",
            "author",
            "author_username",
            "author_info",
            "created_at",
            "updated_at",
            "status",
            "status_display",
            "mentions",
            "tags",
        ]
        read_only_fields = ["id", "display_id", "author", "created_at", "updated_at"]

    def get_author_username(self, obj):
        return obj.author.username if obj.author else None

    def get_folder_path(self, obj):
        if obj.folder:
            return obj.folder.path
        return ""


class NotebookEntryCreateSerializer(serializers.ModelSerializer):
    """Write-only serializer. Folder defaults to 'Default' if omitted."""

    folder = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(), required=False, allow_null=True
    )
    content = serializers.JSONField(validators=[validate_tiptap_json])
    status = serializers.ChoiceField(choices=["in_progress", "finished"], required=False)
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(), many=True, required=False, write_only=True
    )

    class Meta:
        model = NotebookEntry
        fields = ["title", "content", "folder", "status", "tag_ids"]

    def create(self, validated_data):
        tag_ids = validated_data.pop("tag_ids", [])
        entry = super().create(validated_data)
        if tag_ids:
            entry.tags.set(tag_ids)
        return entry

    def update(self, instance, validated_data):
        tag_ids = validated_data.pop("tag_ids", None)
        instance = super().update(instance, validated_data)
        if tag_ids is not None:
            instance.tags.set(tag_ids)
        return instance


class ElnActionSerializer(serializers.ModelSerializer):
    """Read-only serializer for an ELN action log entry.

    Includes the user who performed the action so the frontend can render
    avatars and display names.
    """

    performed_by = UserSerializer(read_only=True)

    class Meta:
        model = ElnAction
        fields = [
            "id",
            "action_type",
            "target_type",
            "target_id",
            "metadata",
            "created_at",
            "performed_by",
        ]
        read_only_fields = fields


class ElnActionCreateSerializer(serializers.ModelSerializer):
    """Write-only serializer for logging a custom action against an entry."""

    class Meta:
        model = ElnAction
        fields = ["action_type", "metadata"]
        # target_type, target_id, and performed_by are set by the view
