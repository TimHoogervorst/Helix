"""Tests for ActionLoggingMixin + @logs_action decorator.

Tests spy on ``log_action()`` — the highest seam — and assert it was
(or was not) called with the expected arguments.  No DB-level
assertions on action rows.
"""

from unittest.mock import patch

from django.test import override_settings
from django.urls import include, path
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.routers import SimpleRouter

from core.actions.mixins import ActionLoggingMixin, logs_action
from core.models import Folder
from core.tests.base import BaseTestCase


# ═══════════════════════════════════════════════════════════════════════
# Test viewset — defined at module level so the module can serve as
# ROOT_URLCONF via override_settings(ROOT_URLCONF=__name__).
# ═══════════════════════════════════════════════════════════════════════


class WidgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Folder
        fields = ["id", "name", "parent"]
        extra_kwargs = {"parent": {"required": False, "allow_null": True}}


class WidgetViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    """Minimal ModelViewSet exercising ActionLoggingMixin."""

    queryset = Folder.objects.all()
    serializer_class = WidgetSerializer

    action_log_config = {
        "create": {
            "action_type": "test.widget.created",
        },
        "update": {
            "action_type": "test.widget.edited",
            "get_metadata": lambda inst, data, req: {
                "changed_fields": list(data.keys()) if data else [],
            },
        },
        "partial_update": {
            "action_type": "test.widget.edited",
            "get_metadata": lambda inst, data, req: {
                "changed_fields": list(data.keys()) if data else [],
            },
        },
        "destroy": {
            "action_type": "test.widget.deleted",
        },
        "list_custom": {
            "action_type": "test.widget.batched",
            "get_target": lambda inst, req: -1,  # list-route actions need get_target
        },
    }

    @logs_action("test.widget.pinged", get_metadata=lambda inst, data, req: {"echo": True})
    @action(detail=True, methods=["post"])
    def ping(self, request, pk=None):
        """Decorated with @logs_action — should be logged."""
        return Response({"pong": True})

    @action(detail=True, methods=["post"])
    def noop(self, request, pk=None):
        """Not in action_log_config — should NOT be logged."""
        return Response({"ok": True})

    @action(detail=False, methods=["post"])
    def list_custom(self, request):
        """List-route custom action with get_target in config."""
        return Response({"done": True})


router = SimpleRouter()
router.register(r"widgets", WidgetViewSet, basename="widget")

urlpatterns = [
    path("api/", include(router.urls)),
]


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════

MIXIN_LOG_ACTION_PATH = "core.actions.mixins.log_action"


def _log_kwargs(mock):
    """Return the keyword-args dict from the *first* call to *mock*."""
    if mock.call_count == 0:
        return {}
    return mock.call_args[1]


# ═══════════════════════════════════════════════════════════════════════
# Core CRUD tests
# ═══════════════════════════════════════════════════════════════════════


@override_settings(ROOT_URLCONF=__name__)
class CreateActionLoggingTests(BaseTestCase):
    """Test that declared create actions are logged."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_create_logs_action(self):
        response = self.client.post(
            "/api/widgets/", {"name": "Widget A"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "test.widget.created")
        self.assertEqual(kwargs["target_type"], "test.widget")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.user)

    def test_create_captures_request_id(self):
        self.client.post("/api/widgets/", {"name": "Widget B"}, format="json")
        kwargs = _log_kwargs(self.mock_log)
        self.assertIsNotNone(kwargs["request_id"])
        # request_id is a UUID
        self.assertEqual(len(str(kwargs["request_id"])), 36)

    def test_create_captures_client_ip(self):
        self.client.post("/api/widgets/", {"name": "Widget C"}, format="json")
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")

    def test_create_unauthenticated_does_not_log(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            "/api/widgets/", {"name": "Widget D"}, format="json"
        )
        self.assertEqual(response.status_code, 403)  # IsAuthenticated default
        self.mock_log.assert_not_called()


@override_settings(ROOT_URLCONF=__name__)
class UpdateActionLoggingTests(BaseTestCase):
    """Test that declared update/partial_update actions are logged."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.widget = Folder.objects.create(name="Original")
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_update_logs_action(self):
        response = self.client.put(
            f"/api/widgets/{self.widget.pk}/",
            {"name": "Updated"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "test.widget.edited")
        self.assertEqual(kwargs["target_id"], self.widget.pk)
        self.assertEqual(kwargs["user"], self.user)

    def test_update_passes_metadata_hook(self):
        self.client.put(
            f"/api/widgets/{self.widget.pk}/",
            {"name": "MetaTest"},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["metadata"], {"changed_fields": ["name"]})

    def test_partial_update_logs_action(self):
        response = self.client.patch(
            f"/api/widgets/{self.widget.pk}/",
            {"name": "Patched"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "test.widget.edited")

    def test_update_captures_request_id_and_client_ip(self):
        self.client.patch(
            f"/api/widgets/{self.widget.pk}/",
            {"name": "N"},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertIsNotNone(kwargs["request_id"])
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")


@override_settings(ROOT_URLCONF=__name__)
class DestroyActionLoggingTests(BaseTestCase):
    """Test that declared destroy actions are logged."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.widget = Folder.objects.create(name="ToDelete")
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_destroy_logs_action(self):
        response = self.client.delete(f"/api/widgets/{self.widget.pk}/")
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "test.widget.deleted")
        self.assertEqual(kwargs["target_id"], self.widget.pk)
        self.assertEqual(kwargs["user"], self.user)


@override_settings(ROOT_URLCONF=__name__)
class OptInNoAutoDetectionTests(BaseTestCase):
    """Test that only declared actions are logged — no auto-detection."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.widget = Folder.objects.create(name="OptIn")
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_list_does_not_log(self):
        response = self.client.get("/api/widgets/")
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_not_called()

    def test_retrieve_does_not_log(self):
        response = self.client.get(f"/api/widgets/{self.widget.pk}/")
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_not_called()

    def test_undeclared_custom_action_does_not_log(self):
        self.client.post(f"/api/widgets/{self.widget.pk}/noop/")
        self.mock_log.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════
# @logs_action decorator tests
# ═══════════════════════════════════════════════════════════════════════


@override_settings(ROOT_URLCONF=__name__)
class LogsActionDecoratorTests(BaseTestCase):
    """Test that @logs_action works for custom @action methods."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.widget = Folder.objects.create(name="Decorated")
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_decorated_action_logs(self):
        response = self.client.post(
            f"/api/widgets/{self.widget.pk}/ping/", format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"pong": True})
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "test.widget.pinged")
        self.assertEqual(kwargs["target_id"], self.widget.pk)
        self.assertEqual(kwargs["metadata"], {"echo": True})

    def test_decorated_action_metadata_signature(self):
        """get_metadata receives (instance, validated_data, request)."""
        captured = {}

        # Patch get_metadata on the config to capture its arguments.
        original = WidgetViewSet.action_log_config["ping"]["get_metadata"]

        def _capture(instance, validated_data, request):
            captured["instance"] = instance
            captured["validated_data"] = validated_data
            captured["request_user"] = request.user
            return original(instance, validated_data, request)

        WidgetViewSet.action_log_config["ping"]["get_metadata"] = _capture
        try:
            self.client.post(f"/api/widgets/{self.widget.pk}/ping/", format="json")
            self.assertIsNotNone(captured.get("instance"))
            self.assertEqual(captured["instance"].pk, self.widget.pk)
            self.assertIsNone(captured["validated_data"])
            self.assertEqual(captured["request_user"], self.user)
        finally:
            WidgetViewSet.action_log_config["ping"]["get_metadata"] = original


# ═══════════════════════════════════════════════════════════════════════
# List-route custom actions
# ═══════════════════════════════════════════════════════════════════════


@override_settings(ROOT_URLCONF=__name__)
class ListRouteActionLoggingTests(BaseTestCase):
    """Test custom list-route actions with get_target."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_list_route_custom_action_logs(self):
        response = self.client.post("/api/widgets/list_custom/", format="json")
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "test.widget.batched")
        self.assertEqual(kwargs["target_id"], -1)  # from get_target


# ═══════════════════════════════════════════════════════════════════════
# Fail-open tests
# ═══════════════════════════════════════════════════════════════════════


@override_settings(ROOT_URLCONF=__name__)
class FailOpenTests(BaseTestCase):
    """Test that logging failure never breaks the response."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.widget = Folder.objects.create(name="FailOpen")

    def test_log_action_exception_does_not_break_create(self):
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.post(
                "/api/widgets/", {"name": "Survivor"}, format="json"
            )
        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)

    def test_log_action_exception_does_not_break_update(self):
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.put(
                f"/api/widgets/{self.widget.pk}/",
                {"name": "UpdatedAnyway"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)

    def test_log_action_exception_does_not_break_destroy(self):
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.delete(f"/api/widgets/{self.widget.pk}/")
        self.assertEqual(response.status_code, 204)

    def test_log_action_exception_does_not_break_custom_action(self):
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.post(
                f"/api/widgets/{self.widget.pk}/ping/", format="json"
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"pong": True})
