from .models import ConcreteTestEntity
from bundled.access.access.scoping import visible_rows_q


def register(mod):
    entity = mod.register_model("entity", ConcreteTestEntity)
    mod.register_content_source(
        "entry",
        entity,
        visibility_query=lambda request, queryset: queryset.filter(
            visible_rows_q(request.user)
        ),
        hub_visible=True,
    )
    mod.register_custom_action("entity.created", "Fixture created", "created", entity)
