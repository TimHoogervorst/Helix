"""Serializers for the unified POST /api/actions/ endpoint.

``ActionCreateSerializer`` validates the incoming payload.
"""

from __future__ import annotations

from rest_framework import serializers


class ActionCreateSerializer(serializers.Serializer):
    """Validate the payload for ``POST /api/actions/``.

    ``performed_by`` is derived from request authentication and is never
    accepted from the client.  ``timestamp`` is accepted but ignored in
    the initial implementation — ``created_at`` is always server-set via
    ``auto_now_add``.
    """

    action_type = serializers.CharField(
        required=True,
        max_length=128,
        help_text="Triple-dotted action type, e.g. 'eln.entry.created'.",
    )
    target_type = serializers.CharField(
        required=True,
        max_length=100,
        help_text="Namespaced target type, e.g. 'eln.entry'.",
    )
    target_id = serializers.IntegerField(
        required=True,
        help_text="Primary key of the target record.",
    )
    workspace_id = serializers.CharField(
        required=True,
        max_length=64,
        help_text="Workspace identifier — also used as the mod ID for routing.",
    )
    metadata = serializers.JSONField(
        required=False,
        default=dict,
        help_text="Freeform JSON payload: what changed, context, snapshot data.",
    )
    timestamp = serializers.DateTimeField(
        required=False,
        help_text=(
            "ISO 8601 datetime from the client (for offline/batched actions). "
            "Ignored in the initial implementation — created_at is always "
            "server-set."
        ),
    )
