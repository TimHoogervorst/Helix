from django.urls import path, include
from rest_framework.routers import DefaultRouter

from helix_core.views import (
    ActionCreateView,
    ActionInvocationCollectionView,
    ActionInvocationDetailView,
    ColorTokenViewSet,
    IconLibraryViewSet,
    ModRegistryView,
    ModBootView,
    ModLifecycleView,
    RetainedContractView,
    SchemaViewSet,
    SchemaTypeViewSet,
    EntityHubListView,
    EntityHubQueryView,
    FormulaEvaluateView,
    PlatformRecordCollectionView,
    PlatformRecordDetailView,
    PlatformRecordFormView,
    RecordActionExecuteView,
    PlatformRecordRevisionsView,
    PlatformRecordGroupHistoryView,
    PlatformRecordActivityView,
    PlatformRecordExportView,
)

# Router for schemas, schema-types, and colors
router = DefaultRouter()
router.register(r"schemas", SchemaViewSet, basename="schema")
router.register(r"schema-types", SchemaTypeViewSet, basename="schema-type")
router.register(r"colors", ColorTokenViewSet, basename="color-token")
router.register(r"icons", IconLibraryViewSet, basename="icon-library")

# Router for the registry (cross-mod entity browsing)
registry_router = DefaultRouter()
registry_router.register(r"entities", EntityHubListView, basename="registry-entity")

urlpatterns = [
    path("action-invocations/", ActionInvocationCollectionView.as_view(), name="action-invocation-list"),
    path("action-invocations/<str:invocation_id>/", ActionInvocationDetailView.as_view(), name="action-invocation-detail"),
    path("actions/execute/", RecordActionExecuteView.as_view(), name="record-action-execute"),
    path("records/", PlatformRecordCollectionView.as_view(), name="platform-record-list-create"),
    path("records/<uuid:record_id>/", PlatformRecordDetailView.as_view(), name="platform-record-detail"),
    path("records/<uuid:record_id>/form/", PlatformRecordFormView.as_view(), name="platform-record-form"),
    path("records/<uuid:record_id>/revisions/", PlatformRecordRevisionsView.as_view(), name="platform-record-revisions"),
    path("records/<uuid:record_id>/groups/<uuid:group_id>/revisions/", PlatformRecordGroupHistoryView.as_view(), name="platform-record-group-history"),
    path("records/<uuid:record_id>/groups/<uuid:group_id>/revisions/<uuid:revision_id>/", PlatformRecordGroupHistoryView.as_view(), name="platform-record-exact-revision"),
    path("records/<uuid:record_id>/actions/", PlatformRecordActivityView.as_view(), name="platform-record-activity"),
    path("records/<uuid:record_id>/export/", PlatformRecordExportView.as_view(), name="platform-record-export"),
    path("formulas/evaluate/", FormulaEvaluateView.as_view(), name="formula-evaluate"),
    path("actions/", ActionCreateView.as_view(), name="action-create"),
    path("", include(router.urls)),
    path("registry/", include(registry_router.urls)),
    path(
        "registry/entities/query/",
        EntityHubQueryView.as_view(),
        name="registry-entity-query",
    ),
    path("mod-registry/", ModRegistryView.as_view(), name="mod-registry"),
    path("mod-boot/", ModBootView.as_view(), name="mod-boot"),
    path("mod-lifecycle/", ModLifecycleView.as_view(), name="mod-lifecycle"),
    path(
        "contracts/<str:kind>/<str:contract_id>/<str:version>/",
        RetainedContractView.as_view(),
        name="retained-contract",
    ),
]
