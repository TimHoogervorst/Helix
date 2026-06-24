from rest_framework import serializers

from core.models import Folder

from .models import NotebookEntry, Mention


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


class NotebookEntrySerializer(serializers.ModelSerializer):
    author_username = serializers.SerializerMethodField()
    folder_name = serializers.CharField(source="folder.name", read_only=True)
    mentions = MentionSerializer(many=True, read_only=True)

    class Meta:
        model = NotebookEntry
        fields = [
            "id",
            "display_id",
            "title",
            "content",
            "folder",
            "folder_name",
            "author",
            "author_username",
            "created_at",
            "updated_at",
            "mentions",
        ]
        read_only_fields = ["id", "display_id", "author", "created_at", "updated_at"]

    def get_author_username(self, obj):
        return obj.author.username if obj.author else None


class NotebookEntryCreateSerializer(serializers.ModelSerializer):
    """Write-only serializer. Folder defaults to 'Default' if omitted."""

    folder = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(), required=False
    )
    content = serializers.JSONField(validators=[validate_tiptap_json])

    class Meta:
        model = NotebookEntry
        fields = ["title", "content", "folder"]
