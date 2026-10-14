from .models import ConcreteTestEntity


def register(mod):
    entity = mod.register_model("entity", ConcreteTestEntity)
    mod.register_content_source("content", entity, hub_visible=True)
    mod.register_custom_action("entity.created", "Fixture created", "created", entity)
