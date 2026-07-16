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

    # Object-form dependencies with version constraints are also accepted:
    manifest = ModManifest(
        id="eln",
        display_name="Electronic Lab Notebook",
        depends_on=[
            "lims",
            {"id": "tags", "version": ">=2.0"},
        ],
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
        version: Semver string (e.g. ``"0.1.0"``).  Optional — core mods
            inherit the platform version when omitted.
        depends_on: Direct dependencies of this mod.  Non-transitive — a
            mod only declares what it directly uses.  Entries can be bare
            mod ID strings or dicts with ``id`` (required) and optional
            ``version`` constraint.
        core_version: Minimum platform version required by this mod.
        icon: Legacy icon name.  Temporary; kept for compatibility.
        description: Short description for settings and mod listing screens.

    Raises:
        TypeError: If any field has the wrong type.
        ValueError: If ``id`` or ``display_name`` is empty, or if
            ``depends_on`` contains invalid entries.
    """

    id: str
    display_name: str
    version: str | None = None
    depends_on: list[str | dict[str, str]] = field(default_factory=list)
    core_version: str | None = None
    icon: str | None = None
    description: str | None = None

    @property
    def dependency_ids(self) -> list[str]:
        """Extract just the mod ID strings from ``depends_on`` entries.

        Each entry in ``depends_on`` can be either a bare string (the mod ID)
        or a dict with an ``"id"`` key and optional ``"version"`` key.
        This property returns just the IDs, suitable for topological sort
        and dependency validation.
        """
        ids: list[str] = []
        for dep in self.depends_on:
            if isinstance(dep, str):
                ids.append(dep)
            else:
                ids.append(dep["id"])
        return ids

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

        # --- version (optional) ---
        if self.version is not None:
            if not isinstance(self.version, str):
                raise TypeError(
                    f"ModManifest.version must be str or None, "
                    f"got {type(self.version).__name__}"
                )
            if not self.version:
                raise ValueError(
                    "ModManifest.version must be a non-empty string "
                    "when provided"
                )

        # --- depends_on ---
        if not isinstance(self.depends_on, list):
            raise TypeError(
                f"ModManifest.depends_on must be a list, "
                f"got {type(self.depends_on).__name__}"
            )
        for i, dep in enumerate(self.depends_on):
            if isinstance(dep, str):
                continue
            if not isinstance(dep, dict):
                raise TypeError(
                    f"ModManifest.depends_on[{i}] must be str or dict, "
                    f"got {type(dep).__name__}"
                )
            if "id" not in dep:
                raise ValueError(
                    f"ModManifest.depends_on[{i}] dict must have an 'id' key"
                )
            if not isinstance(dep["id"], str):
                raise TypeError(
                    f"ModManifest.depends_on[{i}].id must be str, "
                    f"got {type(dep['id']).__name__}"
                )
            if "version" in dep and not isinstance(dep["version"], str):
                raise TypeError(
                    f"ModManifest.depends_on[{i}].version must be str, "
                    f"got {type(dep['version']).__name__}"
                )

        # --- core_version (optional) ---
        if self.core_version is not None and not isinstance(
            self.core_version, str
        ):
            raise TypeError(
                f"ModManifest.core_version must be str or None, "
                f"got {type(self.core_version).__name__}"
            )

        # --- icon (optional) ---
        if self.icon is not None and not isinstance(self.icon, str):
            raise TypeError(
                f"ModManifest.icon must be str or None, "
                f"got {type(self.icon).__name__}"
            )

        # --- description (optional) ---
        if self.description is not None and not isinstance(
            self.description, str
        ):
            raise TypeError(
                f"ModManifest.description must be str or None, "
                f"got {type(self.description).__name__}"
            )
