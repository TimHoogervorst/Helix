from django.apps import AppConfig


class AccessConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "mods.access"
    label = "access"

    def ready(self):
        import mods.access.signals  # noqa: F401
