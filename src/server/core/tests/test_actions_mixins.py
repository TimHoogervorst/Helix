"""Tests for ActionLoggingMixin + @logs_action decorator.

Tests spy on ``log_action()`` — the highest seam — and assert it was
(or was not) called with the expected arguments.  No DB-level
assertions on action rows.
"""

import uuid
from unittest.mock import patch

from django.test import override_settings
from django.urls import include, path
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.routers import SimpleRouter

from helix_core.actions.logger import bulk_log_actions
from helix_core.actions.mixins import ActionLoggingMixin, logs_action
from core.models import Folder
from core.tests.base import BaseTestCase


# ═══════════════════════════════════════════════════════════════════════
# Test viewset — defined at module level so the module can serve as
# ROOT_URLCONF via override_settings(ROOT_URLCONF=__name__).
# ═══════════════════════════════════════════════════════════════════════


class WidgetBatchSerializer(serializers.Serializer):
    """Serializer for batch action tests — mirrors ElnActionBatchSerializer."""

    actions = serializers.ListField(
        child=serializers.DictField(child=serializers.JSONField()),
        min_length=1,
        allow_empty=False,
    )

    def validate_actions(self, value):
        for i, entry in enumerate(value):
            action = entry.get("action", "")
            if not action or not str(action).strip():
                raise serializers.ValidationError(
                    f"actions[{i}]: 'action' is required."
                )
            # Enforce triple-dotted convention: "{mod}.{target}.{verb_past}"
            if str(action).count(".") < 2:
                raise serializers.ValidationError(
                    f"actions[{i}]: 'action' must follow the "
                    f"triple-dotted convention, got '{action}'."
                )
        return value


class WidgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Folder
        fields = ["id", "name", "parent", "project"]
        extra_kwargs = {"parent": {"required": False, "allow_null": True}}


class WidgetViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
    """Minimal ModelViewSet exercising ActionLoggingMixin."""

    queryset = Folder.objects.all()
    serializer_class = WidgetSerializer

    action_log_config = {
        "create": {
            "action": "test.widget.created",
        },
        "update": {
            "action": "test.widget.edited",
            "get_metadata": lambda inst, data, req: {
                "changed_fields": list(data.keys()) if data else [],
            },
        },
        "partial_update": {
            "action": "test.widget.edited",
            "get_metadata": lambda inst, data, req: {
                "changed_fields": list(data.keys()) if data else [],
            },
        },
        "destroy": {
            "action": "test.widget.deleted",
        },
        "list_custom": {
            "action": "test.widget.batched",
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

    @action(detail=True, methods=["post"], url_path="actions/batch")
    def actions_batch(self, request, pk=None):
        """Batch endpoint that mirrors the ELN entry_actions_batch."""
        instance = self.get_object()
        serializer = WidgetBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        batch_request_id = uuid.uuid4()
        client_ip = request.META.get("REMOTE_ADDR", "")

        try:
            results = bulk_log_actions(
                user=request.user,
                actions=serializer.validated_data["actions"],
                target_type="test.widget",
                target_id=instance.pk,
                request_id=batch_request_id,
                client_ip=client_ip or None,
            )
            return Response(
                {"count": len(results), "request_id": str(batch_request_id)},
                status=status.HTTP_201_CREATED,
            )
        except Exception:
            return Response(
                {"count": 0, "request_id": str(batch_request_id)},
                status=status.HTTP_201_CREATED,
            )


router = SimpleRouter()
router.register(r"widgets", WidgetViewSet, basename="widget")

urlpatterns = [
    path("api/", include(router.urls)),
]


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════

MIXIN_LOG_ACTION_PATH = "helix_core.actions.mixins.log_action"


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
            "/api/widgets/", {"name": "Widget A", "project": self.project.id, "parent": self.folder.id}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "test.widget.created")
        self.assertEqual(kwargs["target_type"], "test.widget")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.user)

    def test_create_captures_request_id(self):
        self.client.post("/api/widgets/", {"name": "Widget B", "project": self.project.id, "parent": self.folder.id}, format="json")
        kwargs = _log_kwargs(self.mock_log)
        self.assertIsNotNone(kwargs["request_id"])
        # request_id is a UUID
        self.assertEqual(len(str(kwargs["request_id"])), 36)

    def test_create_captures_client_ip(self):
        self.client.post("/api/widgets/", {"name": "Widget C", "project": self.project.id, "parent": self.folder.id}, format="json")
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")

    def test_create_unauthenticated_does_not_log(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            "/api/widgets/", {"name": "Widget D", "project": self.project.id, "parent": self.folder.id}, format="json"
        )
        self.assertEqual(response.status_code, 403)  # IsAuthenticated default
        self.mock_log.assert_not_called()


@override_settings(ROOT_URLCONF=__name__)
class UpdateActionLoggingTests(BaseTestCase):
    """Test that declared update/partial_update actions are logged."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.widget = Folder.objects.create(name="Original", project=self.project, parent=self.folder)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_update_logs_action(self):
        response = self.client.put(
            f"/api/widgets/{self.widget.pk}/",
            {"name": "Updated", "project": self.project.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "test.widget.edited")
        self.assertEqual(kwargs["target_id"], self.widget.pk)
        self.assertEqual(kwargs["user"], self.user)

    def test_update_passes_metadata_hook(self):
        self.client.put(
            f"/api/widgets/{self.widget.pk}/",
            {"name": "MetaTest", "project": self.project.id},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["metadata"], {"changed_fields": ["name", "project"]})

    def test_partial_update_logs_action(self):
        response = self.client.patch(
            f"/api/widgets/{self.widget.pk}/",
            {"name": "Patched"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "test.widget.edited")

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
        self.widget = Folder.objects.create(name="ToDelete", project=self.project, parent=self.folder)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_destroy_logs_action(self):
        response = self.client.delete(f"/api/widgets/{self.widget.pk}/")
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "test.widget.deleted")
        self.assertEqual(kwargs["target_id"], self.widget.pk)
        self.assertEqual(kwargs["user"], self.user)


@override_settings(ROOT_URLCONF=__name__)
class OptInNoAutoDetectionTests(BaseTestCase):
    """Test that only declared actions are logged — no auto-detection."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.widget = Folder.objects.create(name="OptIn", project=self.project, parent=self.folder)
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
        self.widget = Folder.objects.create(name="Decorated", project=self.project, parent=self.folder)
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
        self.assertEqual(kwargs["action"], "test.widget.pinged")
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
        self.assertEqual(kwargs["action"], "test.widget.batched")
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
        self.widget = Folder.objects.create(name="FailOpen", project=self.project, parent=self.folder)

    def test_log_action_exception_does_not_break_create(self):
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.post(
                "/api/widgets/", {"name": "Survivor", "project": self.project.id, "parent": self.folder.id}, format="json"
            )
        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)

    def test_log_action_exception_does_not_break_update(self):
        with patch(MIXIN_LOG_ACTION_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.put(
                f"/api/widgets/{self.widget.pk}/",
                {"name": "UpdatedAnyway", "project": self.project.id},
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


# ═══════════════════════════════════════════════════════════════════════
# Batch endpoint tests (issue #221)
# ═══════════════════════════════════════════════════════════════════════

BULK_LOG_ACTIONS_PATH = "core.tests.test_actions_mixins.bulk_log_actions"


def _bulk_kwargs(mock):
    """Return the keyword-args dict from the *first* call to *mock*."""
    if mock.call_count == 0:
        return {}
    return mock.call_args[1]


@override_settings(ROOT_URLCONF=__name__)
class BatchActionEndpointTests(BaseTestCase):
    """Test the batch action endpoint on a test viewset."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.widget = Folder.objects.create(name="BatchTarget", project=self.project, parent=self.folder)
        self._patcher = patch(BULK_LOG_ACTIONS_PATH)
        self.mock_bulk = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_batch_endpoint_calls_bulk_log_actions(self):
        """The batch endpoint calls bulk_log_actions with correct args."""
        payload = {
            "actions": [
                {"action": "test.widget.table_edited", "metadata": {"name": "T"}},
                {"action": "test.widget.comment_created", "metadata": {}},
            ]
        }
        response = self.client.post(
            f"/api/widgets/{self.widget.pk}/actions/batch/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.mock_bulk.assert_called_once()
        kwargs = _bulk_kwargs(self.mock_bulk)
        self.assertEqual(kwargs["user"], self.user)
        self.assertEqual(kwargs["target_type"], "test.widget")
        self.assertEqual(kwargs["target_id"], self.widget.pk)
        self.assertEqual(len(kwargs["actions"]), 2)

    def test_batch_endpoint_shared_request_id(self):
        """All actions in the batch share a single request_id."""
        payload = {
            "actions": [
                {"action": "test.widget.table_edited", "metadata": {}},
                {"action": "test.widget.comment_created", "metadata": {}},
            ]
        }
        response = self.client.post(
            f"/api/widgets/{self.widget.pk}/actions/batch/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        kwargs = _bulk_kwargs(self.mock_bulk)
        # Same request_id passed to bulk_log_actions
        self.assertIsNotNone(kwargs["request_id"])
        # Response returns the request_id
        self.assertIn("request_id", response.data)
        self.assertEqual(len(str(response.data["request_id"])), 36)

    def test_batch_endpoint_captures_client_ip(self):
        """client_ip is captured from the request."""
        payload = {
            "actions": [{"action": "test.widget.table_edited", "metadata": {}}]
        }
        self.client.post(
            f"/api/widgets/{self.widget.pk}/actions/batch/",
            payload,
            format="json",
        )
        kwargs = _bulk_kwargs(self.mock_bulk)
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")

    def test_batch_endpoint_returns_count_and_request_id(self):
        """Response includes count and request_id."""
        payload = {
            "actions": [
                {"action": "test.widget.a", "metadata": {}},
                {"action": "test.widget.b", "metadata": {}},
                {"action": "test.widget.c", "metadata": {}},
            ]
        }
        response = self.client.post(
            f"/api/widgets/{self.widget.pk}/actions/batch/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("count", response.data)
        self.assertIn("request_id", response.data)

    def test_batch_endpoint_fail_open(self):
        """Logging failure does not break the response (fail-open)."""
        payload = {
            "actions": [{"action": "test.widget.table_edited", "metadata": {}}]
        }
        with patch(BULK_LOG_ACTIONS_PATH, side_effect=RuntimeError("DB down")):
            response = self.client.post(
                f"/api/widgets/{self.widget.pk}/actions/batch/",
                payload,
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["count"], 0)

    def test_batch_endpoint_rejects_empty_actions(self):
        """Empty actions list is rejected with 400."""
        payload = {"actions": []}
        response = self.client.post(
            f"/api/widgets/{self.widget.pk}/actions/batch/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_batch_endpoint_rejects_missing_action_type(self):
        """Action entry without action_type is rejected with 400."""
        payload = {"actions": [{"metadata": {}}]}
        response = self.client.post(
            f"/api/widgets/{self.widget.pk}/actions/batch/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_batch_endpoint_rejects_non_triple_dotted_action_type(self):
        """Action entry with non-triple-dotted action_type is rejected."""
        payload = {"actions": [{"action": "not_enough_dots", "metadata": {}}]}
        response = self.client.post(
            f"/api/widgets/{self.widget.pk}/actions/batch/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_batch_endpoint_requires_authentication(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)
        payload = {
            "actions": [{"action": "test.widget.table_edited", "metadata": {}}]
        }
        response = self.client.post(
            f"/api/widgets/{self.widget.pk}/actions/batch/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, 403)
