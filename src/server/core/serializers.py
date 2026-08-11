from rest_framework import serializers

from .models import CoreSetting, Folder, Project


class FolderSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    project = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.all(),
    )

    class Meta:
        model = Folder
        fields = ["id", "name", "parent", "project", "children", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_children(self, obj):
        children = Folder.objects.filter(parent=obj)
        return FolderSerializer(children, many=True).data

    def validate(self, data):
        if self.instance is None:
            parent = data.get("parent")
            project = data.get("project")
            if parent is not None and project is None:
                data["project"] = parent.project
            elif project is None:
                raise serializers.ValidationError(
                    {"project": "A Folder must belong to a Project. "
                                "Provide 'project' or create under a parent folder."}
                )
        else:
            parent = data.get("parent")
            project = data.get("project")
            if self.instance.is_hidden_root:
                if "name" in data:
                    raise serializers.ValidationError(
                        {"name": "The hidden Project root cannot be renamed."}
                    )
                if "parent" in data and parent != self.instance.parent:
                    raise serializers.ValidationError(
                        {"parent": "The hidden Project root cannot be moved."}
                    )
            if parent is not None and project is None:
                data["project"] = parent.project
        return data


# ── CoreSetting ────────────────────────────────────────────────────────────


class CoreSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoreSetting
        fields = ["id", "key", "value"]
        read_only_fields = ["id", "key"]
