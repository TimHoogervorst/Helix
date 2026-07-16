from django.apps import AppConfig


class UsersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core_mods.users"
    label = "core_mods_users"

    def ready(self):
        from helix_core.actions.registry import register_action_model
        from .models import CoreAction

        register_action_model("core", CoreAction)
