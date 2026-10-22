"""Extension seam for Platform-owned attachment metadata in JSON exports."""

from __future__ import annotations

from typing import Any


def attachment_metadata_for_export(record, snapshot: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Return authorized metadata supplied by the active Platform file slice.

    The callback receives the already-authorized source record and selected
    snapshot. It returns metadata only; it must not recursively export referenced
    records or expose attachment bytes. Missing or failing callbacks are handled
    by the caller as an explicit unavailable optional capability.
    """
    from django.conf import settings

    exporter = getattr(settings, "HELIX_ATTACHMENT_METADATA_EXPORTER", None)
    if exporter is None:
        raise LookupError("No Platform attachment metadata extension is installed.")
    if not callable(exporter):
        raise TypeError("HELIX_ATTACHMENT_METADATA_EXPORTER must be callable.")
    result = exporter(record=record, snapshot=snapshot)
    if not isinstance(result, list) or any(not isinstance(item, dict) for item in result):
        raise TypeError("Attachment metadata exporter must return a list of objects.")
    return result
