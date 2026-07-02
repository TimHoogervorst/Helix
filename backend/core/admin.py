from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Folder, PinnedWorkspace, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    pass


@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ["name", "parent", "created_at"]
    search_fields = ["name"]


@admin.register(PinnedWorkspace)
class PinnedWorkspaceAdmin(admin.ModelAdmin):
    list_display = ["display_id", "label", "url", "user", "created_at"]
    search_fields = ["display_id", "label", "url"]
