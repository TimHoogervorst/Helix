# Generated manually — adds icon field to Tag model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eln', '0009_add_tag_model'),
    ]

    operations = [
        migrations.AddField(
            model_name='tag',
            name='icon',
            field=models.CharField(
                choices=[
                    ('circle', 'Circle'),
                    ('dna', 'DNA'),
                    ('rat', 'Rat'),
                    ('leaf', 'Leaf'),
                    ('cog', 'Machine'),
                    ('notebook', 'Entry'),
                    ('user', 'Person'),
                    ('folder', 'Folder'),
                ],
                default='circle',
                max_length=50,
            ),
        ),
    ]
