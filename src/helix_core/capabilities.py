"""Validation and vocabulary for registry capabilities.

Capabilities are deliberately separate from the user-facing Tag model.  The
platform vocabulary is extensible at runtime so adding a platform capability
does not require changing every consumer.
"""

from __future__ import annotations

import re

_NAMESPACED = re.compile(r"^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+:[a-z][a-z0-9._-]*$")

# Versioned platform vocabulary. Extensions use a vendor namespace rather than
# mutating the platform contract at runtime.
PLATFORM_CAPABILITY_VERSION = 1
PLATFORM_CAPABILITIES: frozenset[str] = frozenset(
    {"RegistrationTable", "ResultTable", "editor"}
)
RegistrationTable = "RegistrationTable"
ResultTable = "ResultTable"


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
