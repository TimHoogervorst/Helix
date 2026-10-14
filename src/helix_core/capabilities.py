"""Validation and vocabulary for registry capabilities.

Capabilities are deliberately separate from the user-facing Tag model.  The
platform vocabulary is extensible at runtime so adding a platform capability
does not require changing every consumer.
"""

from __future__ import annotations

import re

_NAMESPACED = re.compile(r"^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+:[a-z][a-z0-9._-]*$")

# The seed vocabulary is platform-owned.  ``register_platform_capability`` is
# used by platform extensions to grow it without changing validation code.
PLATFORM_CAPABILITIES: set[str] = {"RegistrationTable", "ResultTable", "editor"}
RegistrationTable = "RegistrationTable"
ResultTable = "ResultTable"


def register_platform_capability(name: str) -> None:
    if not name or ":" in name or "." in name:
        raise ValueError("Platform capability names must be unnamespaced words")
    PLATFORM_CAPABILITIES.add(name)


def validate_capabilities(capabilities: list[str], owner_id: str) -> list[str]:
    """Validate and copy declarations made by *owner_id*.

    Unnamespaced values must be in the curated platform vocabulary.  A mod may
    declare only capabilities in its own vendor namespace; consuming a
    foreign namespaced capability is allowed through matching APIs, but
    claiming ownership of it is not.
    """
    result = list(dict.fromkeys(capabilities))
    for capability in result:
        if capability in PLATFORM_CAPABILITIES:
            continue
        if not _NAMESPACED.fullmatch(capability):
            raise ValueError(f"unknown platform capability '{capability}'")
        vendor = capability.split(":", 1)[0]
        if vendor != owner_id:
            raise ValueError(
                f"Mod '{owner_id}' cannot declare foreign capability '{capability}'"
            )
    return result


def validate_accepted_capabilities(capabilities: list[str]) -> list[str]:
    """Validate a consumer's requirements without claiming ownership.

    Consumers may match any well-formed vendor namespace, including one
    supplied by an optional mod that is not installed yet.
    """
    result = list(dict.fromkeys(capabilities))
    for capability in result:
        if capability in PLATFORM_CAPABILITIES:
            continue
        if not _NAMESPACED.fullmatch(capability):
            raise ValueError(f"unknown platform capability '{capability}'")
    return result


def capabilities_match(available: list[str], accepted: list[str]) -> bool:
    return bool(set(available).intersection(accepted))
