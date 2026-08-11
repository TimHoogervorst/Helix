from django.urls import path

from .views import OrganizationView, PeopleView, PolicyView

urlpatterns = [
    path("organization/", OrganizationView.as_view(), name="organization"),
    path("people/", PeopleView.as_view(), name="people"),
    path("policies/", PolicyView.as_view(), name="policies"),
]
