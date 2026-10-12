from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Folder, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    pass


@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ["name", "project", "parent", "created_at"]
    search_fields = ["name"]
