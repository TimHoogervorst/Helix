from rest_framework import serializers

from core.models import Folder

from .models import NotebookEntry, Mention, Tag


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

    class Meta:
        model = Mention
        fields = ["id", "source_type", "source_type_name", "source_id", "target_type", "target_type_name", "target_id", "context"]
        read_only_fields = ["id"]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "color"]
        read_only_fields = ["id"]


class NotebookEntrySerializer(serializers.ModelSerializer):
    author_username = serializers.SerializerMethodField()
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
