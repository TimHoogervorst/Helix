from django.apps import AppConfig


class AccessConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "bundled.access.access"
    label = "access"

    def ready(self):
        import bundled.access.access.signals  # noqa: F401
