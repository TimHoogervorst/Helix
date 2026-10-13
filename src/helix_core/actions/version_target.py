"""Provider-neutral references to immutable target versions."""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class VersionTarget:
    """Identity and evidence for a target version supplied by its provider."""

    reference: str
    object_id: str
    label: Optional[str] = None
    content_hash: Optional[str] = None
