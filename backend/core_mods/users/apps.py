from django.apps import AppConfig

from helix_core.mod_system.registry import registry


class UsersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core_mods.users"
    label = "core_mods_users"

    def ready(self):
        from .models import CoreAction

        registry.register_action_model("core", CoreAction)
