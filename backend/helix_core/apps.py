from django.apps import AppConfig

# Placeholder for the singleton BackendModRegistry.
# Initialized by HelixCoreConfig.ready() in Phase 2 (Unified Backend Registry).
registry = None


class HelixCoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "helix_core"

    def ready(self):
        # Phase 2: initialize the singleton BackendModRegistry here.
        pass
