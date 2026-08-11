from django.urls import path

from .views import OrganizationView, PeopleView

urlpatterns = [
    path("organization/", OrganizationView.as_view(), name="organization"),
    path("people/", PeopleView.as_view(), name="people"),
]
