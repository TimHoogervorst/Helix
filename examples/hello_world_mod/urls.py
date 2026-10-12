from django.http import JsonResponse
from django.views.decorators.http import require_POST

from .models import HelloWorldEntity


@require_POST
def create_entity(request):
    entity = HelloWorldEntity.objects.create(name="Hello World")
    return JsonResponse({"id": entity.pk, "name": entity.name}, status=201)
