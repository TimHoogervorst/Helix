from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="HelloWorldEntity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(default="Hello World", max_length=120)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "hello_world_entity"},
        ),
        migrations.CreateModel(
            name="GreetingState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("greeting", models.CharField(default="Hello from Helix!", max_length=255)),
            ],
            options={"db_table": "hello_world_greeting_state"},
        ),
    ]
