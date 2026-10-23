from django.urls import include, path

from helix_core import ModRegistrar

from .models import GreetingState, HelloWorldEntity


def register(mod: ModRegistrar) -> None:
    entity = mod.register_model("entity", HelloWorldEntity)
    mod.register_schema_type(
        "Hello World Entity",
        workspace_id="helloworld",
        model=entity,
        prefix="HW",
    )
    mod.register_custom_action(
        "example.helloworld.entity.created",
        "Hello World Entity Created",
        "created",
        entity,
    )

    def greeting():
        state = GreetingState.objects.order_by("pk").first()
        return state.greeting if state else "Hello from Helix!"

    greeting_service = mod.register_service("greeting", greeting)

    def service_greeting(request):
        from django.http import JsonResponse

        return JsonResponse({"greeting": mod.call(greeting_service)})

    mod.register_urls(
        [
            path(
                "api/mods/example/helloworld/",
                include("mods.hello_world.urls"),
            ),
            path("api/mods/example/helloworld/greeting/", service_greeting),
        ]
    )
