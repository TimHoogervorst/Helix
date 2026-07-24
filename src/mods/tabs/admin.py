from django.contrib import admin

from .models import PinnedWorkspace


@admin.register(PinnedWorkspace)
class PinnedWorkspaceAdmin(admin.ModelAdmin):
    list_display = ["display_id", "label", "url", "user", "created_at"]
    search_fields = ["display_id", "label", "url"]
