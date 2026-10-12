from django.db import models


class HelloWorldEntity(models.Model):
    """The generic entity created by the example Action."""

    name = models.CharField(max_length=120, default="Hello World")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hello_world_entity"


class GreetingState(models.Model):
    """Mod-owned operational state kept deliberately separate from entities."""

    greeting = models.CharField(max_length=255, default="Hello from Helix!")

    class Meta:
        db_table = "hello_world_greeting_state"
