"""ModManifest dataclass.

Every mod declares a manifest in its ``mod.py`` file.  The manifest provides
identity, version, and dependency information validated at construction time.

The manifest shape mirrors the frontend ``meta`` exactly:

.. code-block:: python

    manifest = ModManifest(
        id="eln",
        display_name="Electronic Lab Notebook",
        version="0.1.0",
        depends_on=["lims", "tags"],
    )
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ModManifest:
    """Declares a mod's identity and dependencies.

    Fields:
        id: Unique mod identifier (e.g. ``"eln"``).  Must be a non-empty
            string.
        display_name: Human-readable name shown in settings and admin.
        version: Semver string (e.g. ``"0.1.0"``).  Documentation-only in
            Phase 1; parsed for compatibility checks later.
        depends_on: Direct dependencies of this mod.  Non-transitive — a
            mod only declares what it directly uses.  Must be a list of
            mod ``id`` strings.

    Raises:
        TypeError: If any field has the wrong type.
        ValueError: If ``id``, ``display_name``, or ``version`` is empty.
    """

    id: str
    display_name: str
    version: str
    depends_on: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        # --- id ---
        if not isinstance(self.id, str):
            raise TypeError(
                f"ModManifest.id must be str, got {type(self.id).__name__}"
            )
        if not self.id:
            raise ValueError("ModManifest.id must be a non-empty string")

        # --- display_name ---
        if not isinstance(self.display_name, str):
            raise TypeError(
                f"ModManifest.display_name must be str, "
                f"got {type(self.display_name).__name__}"
            )
        if not self.display_name:
            raise ValueError(
                "ModManifest.display_name must be a non-empty string"
            )

        # --- version ---
        if not isinstance(self.version, str):
            raise TypeError(
                f"ModManifest.version must be str, "
                f"got {type(self.version).__name__}"
            )
        if not self.version:
            raise ValueError(
                "ModManifest.version must be a non-empty string"
            )

        # --- depends_on ---
        if not isinstance(self.depends_on, list):
            raise TypeError(
                f"ModManifest.depends_on must be a list, "
                f"got {type(self.depends_on).__name__}"
            )
        for i, dep in enumerate(self.depends_on):
            if not isinstance(dep, str):
                raise TypeError(
                    f"ModManifest.depends_on[{i}] must be str, "
                    f"got {type(dep).__name__}"
                )
