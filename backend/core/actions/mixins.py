"""Declarative action logging mixin for DRF viewsets.

``ActionLoggingMixin`` lets mod authors declare what actions their
endpoints perform via a class-level ``action_log_config`` dict.  The
framework intercepts successful mutating responses and writes action
rows automatically — no manual ``log_action()`` wiring needed.
"""

# mypy: disable-error-code=attr-defined
# ``self.request`` / ``self.action`` are provided by DRF's APIView /
# ViewSetMixin at runtime; mypy can't see them on this standalone class.

from __future__ import annotations

import logging
import uuid
from typing import Any, Callable, Dict, Optional

from .logger import log_action

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# public decorator
# ---------------------------------------------------------------------------


def logs_action(action_type: str, **config: Any) -> Callable:
    """Declare that a custom ``@action`` method logs an action.

    The decorated method's config is merged into the viewset's
    ``action_log_config`` at class-creation time.  Works with both
    detail and list ``@action`` decorators.

    Usage::

        class MyViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
            @logs_action("myapp.widget.exported",
                         get_metadata=lambda inst, data, req: {"fmt": "csv"})
            @action(detail=True, methods=["post"])
            def export(self, request, pk=None):
                ...

    Args:
        action_type: Triple-dotted action name (e.g.
            ``"eln.entry.exported"``).
        **config: Additional entries merged into the
            ``action_log_config`` dict for this action.
    """

    def decorator(method: Callable) -> Callable:
        cfg: Dict[str, Any] = {"action_type": action_type}
        cfg.update(config)
        method._action_log_config = cfg  # type: ignore[attr-defined]
        return method

    return decorator


# ---------------------------------------------------------------------------
# mixin
# ---------------------------------------------------------------------------


class ActionLoggingMixin:
    """Mixin that logs actions declaratively based on ``action_log_config``.

    Add this mixin to any DRF ``ViewSet`` and set a class-level
    ``action_log_config`` dict.  The framework automatically calls
    :func:`~core.actions.logger.log_action` on every successful
    mutating response — no manual ``perform_create`` / ``perform_update``
    wiring required.

    **Auto-captured fields:** ``performed_by`` (from ``request.user``),
    ``target_id`` (from the resolved instance), ``client_ip`` (from
    ``request.META["REMOTE_ADDR"]``), ``request_id`` (generated UUID).

    **Fail-open:** if ``log_action()`` raises, the exception is caught
    and logged.  The response goes out unchanged.

    **Opt-in:** only actions declared in ``action_log_config`` are
    logged.  There is no auto-detection of mutating methods.

    Usage::

        class MyViewSet(ActionLoggingMixin, viewsets.ModelViewSet):
            action_log_config = {
                "create": {
                    "action_type": "myapp.widget.created",
                },
                "update": {
                    "action_type": "myapp.widget.edited",
                    "get_metadata": lambda inst, data, req: {
                        "changed": list(data.keys()),
                    },
                },
                "partial_update": {
                    "action_type": "myapp.widget.edited",
                },
                "destroy": {
                    "action_type": "myapp.widget.deleted",
                },
            }

    **Detail-route actions** (``update``, ``partial_update``, ``destroy``,
    and detail ``@action`` methods) default to ``self.get_object()``.
    ``create`` resolves the target from ``serializer.instance.pk``
    automatically.  List-route custom ``@action`` methods need a
    ``get_target`` callable in their config.

    **Custom ``@action`` methods** can be configured either via the
    ``action_log_config`` dict or via the ``@logs_action`` decorator.
    """

    action_log_config: Dict[str, Dict] = {}

    # ------------------------------------------------------------------
    # class-creation hook — harvest @logs_action decorators
    # ------------------------------------------------------------------

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        # Make a copy so subclasses never mutate the parent's config.
        cls.action_log_config = dict(cls.action_log_config)
        for name in dir(cls):
            method = getattr(cls, name, None)
            if callable(method) and hasattr(method, "_action_log_config"):
                cls.action_log_config[name] = method._action_log_config

    # ------------------------------------------------------------------
    # lifecycle hooks
    # ------------------------------------------------------------------

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self._request_id = uuid.uuid4()
        self._client_ip = request.META.get("REMOTE_ADDR", "")

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._maybe_log(
            "create",
            instance=serializer.instance,
            validated_data=getattr(serializer, "validated_data", None),
        )

    def perform_update(self, serializer):
        super().perform_update(serializer)
        self._maybe_log(
            self.action,  # "update" or "partial_update"
            instance=serializer.instance,
            validated_data=getattr(serializer, "validated_data", None),
        )

    def perform_destroy(self, instance):
        # Capture pk before super() — Django sets instance.pk = None
        # after the delete.
        instance._pre_delete_pk = instance.pk  # type: ignore[attr-defined]
        super().perform_destroy(instance)
        self._maybe_log("destroy", instance=instance)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        # Custom @action methods that didn't flow through perform_* above.
        if self.action not in ("create", "update", "partial_update", "destroy") and self._should_log(response):
            self._log_for_action(request, response)
        return response

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------

    def _should_log(self, response) -> bool:
        """Return True when this mutating response should be logged."""
        if not (200 <= response.status_code < 300):
            return False
        if self.request.method not in ("POST", "PUT", "PATCH", "DELETE"):
            return False
        if not self.request.user or not self.request.user.is_authenticated:
            return False
        return self.action in self.action_log_config

    def _maybe_log(self, action_name: str, *, instance, validated_data=None):
        """Log *action_name* if it is declared, swallowing errors."""
        config = self.action_log_config.get(action_name)
        if config is None:
            return
        if not self.request.user or not self.request.user.is_authenticated:
            return
        try:
            self._do_log(config, instance, validated_data, self.request.user)
        except Exception:
            logger.exception(
                "Action logging failed for %s.%s",
                type(self).__name__,
                action_name,
            )

    def _log_for_action(self, request, response):
        """Log a custom ``@action`` method, swallowing errors."""
        config = self.action_log_config[self.action]
        try:
            instance = None
            if self._is_detail_action():
                instance = self.get_object()
            user = self.request.user
            if not user or not user.is_authenticated:
                return
            self._do_log(config, instance, None, user)
        except Exception:
            logger.exception(
                "Action logging failed for %s.%s",
                type(self).__name__,
                self.action,
            )

    def _do_log(self, config, instance, validated_data, user):
        """Call ``log_action()`` with the assembled parameters."""
        action_type: str = config["action_type"]
        target_type: str = config.get(
            "target_type", self._derive_target_type(action_type)
        )
        target_id: int = self._resolve_target_id(config, instance)
        metadata: dict = {}

        get_metadata = config.get("get_metadata")
        if get_metadata is not None:
            metadata = get_metadata(instance, validated_data, self.request) or {}

        version = config.get("version")
        get_version = config.get("get_version")
        if get_version is not None:
            version = get_version(instance)

        log_action(
            user=user,
            action_type=action_type,
            target_type=target_type,
            target_id=target_id,
            metadata=metadata,
            version=version,
            request_id=self._request_id,
            client_ip=self._client_ip or None,
        )

    # ------------------------------------------------------------------
    # target resolution
    # ------------------------------------------------------------------

    @staticmethod
    def _derive_target_type(action_type: str) -> str:
        """Derive ``target_type`` from a triple-dotted ``action_type``.

        Strips the last dot-separated segment (the verb).  For
        ``"eln.entry.created"`` returns ``"eln.entry"``.
        """
        return action_type.rsplit(".", 1)[0]

    def _resolve_target_id(self, config, instance) -> int:
        """Resolve the target PK from *config* or *instance*."""
        get_target = config.get("get_target")
        if get_target is not None:
            return get_target(instance, self.request)
        if instance is not None:
            # instance.pk may be None after destroy (Django nullifies it).
            pk = instance.pk
            if pk is None:
                pk = getattr(instance, "_pre_delete_pk", None)
            if pk is not None:
                return pk
        raise ValueError(
            f"action_log_config['{self.action}'] is missing 'get_target': "
            f"list-route actions must provide a target resolver callable."
        )

    def _is_detail_action(self) -> bool:
        """Return True when the current action targets a single resource."""
        _detail = {"update", "partial_update", "destroy", "retrieve"}
        if self.action in _detail:
            return True
        method = getattr(self, self.action, None)
        return bool(getattr(method, "detail", False))
