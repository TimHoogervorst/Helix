from rest_framework import serializers

from core.models import Folder

from .models import NotebookEntry, Mention


class MentionSerializer(serializers.ModelSerializer):
    target_type_name = serializers.CharField(source="target_type.model", read_only=True)

    class Meta:
        model = Mention
        fields = ["id", "source_entry", "target_type", "target_type_name", "target_id", "context"]
        read_only_fields = ["id"]


class NotebookEntrySerializer(serializers.ModelSerializer):
    author_username = serializers.SerializerMethodField()
    folder_name = serializers.CharField(source="folder.name", read_only=True)
    mentions = MentionSerializer(many=True, read_only=True)

    class Meta:
        model = NotebookEntry
        fields = [
            "id",
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
        read_only_fields = ["id", "author", "created_at", "updated_at"]

    def get_author_username(self, obj):
        return obj.author.username if obj.author else None


class NotebookEntryCreateSerializer(serializers.ModelSerializer):
    """Write-only serializer. Folder defaults to 'Default' if omitted."""

    folder = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(), required=False
    )

    class Meta:
        model = NotebookEntry
        fields = ["title", "content", "folder"]
