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
        request = self.context.get("request")
        if request is not None:
            from mods.access.scoping import visible_folders_q

            children = children.filter(visible_folders_q(request.user))
        return FolderSerializer(children, many=True, context=self.context).data

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
            if parent is not None and project is None:
                data["project"] = parent.project
            if "name" in data and (parent is None or self.instance.parent_id is None):
                from mods.access.models import FolderShare

                if FolderShare.objects.filter(
                    target_project=self.instance.project,
                    source_folder__name=data["name"],
                ).exists():
                    raise serializers.ValidationError(
                        {"name": "A shared folder with this name already exists."}
                    )
        return data


# ── CoreSetting ────────────────────────────────────────────────────────────


class CoreSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoreSetting
        fields = ["id", "key", "value"]
        read_only_fields = ["id", "key"]
