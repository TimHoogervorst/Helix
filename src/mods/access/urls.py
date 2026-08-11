from django.urls import path

from .views import (
    FolderShareDetailView,
    FolderShareListView,
    OrganizationView,
    PeopleView,
    PolicyView,
    ProjectDetailView,
    ProjectGrantDetailView,
    ProjectGrantListView,
    ProjectListView,
    TeamDetailView,
    TeamListView,
    TeamMemberAddView,
    TeamMemberRemoveView,
)

urlpatterns = [
    path("organization/", OrganizationView.as_view(), name="organization"),
    path("people/", PeopleView.as_view(), name="people"),
    path("policies/", PolicyView.as_view(), name="policies"),
    path("teams/", TeamListView.as_view(), name="teams"),
    path("teams/<int:pk>/", TeamDetailView.as_view(), name="team_detail"),
    path("teams/<int:pk>/add_member/", TeamMemberAddView.as_view(), name="team_add_member"),
    path("teams/<int:pk>/remove_member/", TeamMemberRemoveView.as_view(), name="team_remove_member"),
    path("projects/", ProjectListView.as_view(), name="projects"),
    path("projects/<int:pk>/", ProjectDetailView.as_view(), name="project_detail"),
    path("projects/<int:pk>/grants/", ProjectGrantListView.as_view(), name="project_grants"),
    path("projects/<int:project_pk>/grants/<int:pk>/", ProjectGrantDetailView.as_view(), name="grant_detail"),
    path("projects/<int:pk>/folder_shares/", FolderShareListView.as_view(), name="folder_shares"),
    path("folder_shares/<int:pk>/", FolderShareDetailView.as_view(), name="folder_share_detail"),
]
