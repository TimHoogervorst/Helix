"""Private helpers for Platform tests that need the fixture Mod installed."""

import json
from pathlib import Path


def register_external_mod_fixture():
    """Register fixture contributions through the public Mod facade once."""
    from helix_core.mod_system.manifest import ModManifest
    from helix_core.mod_system.registry import registry
    from helix_core.public import ModRegistrar

    if registry.get_content_source("test.external:entry") is not None:
        return

    manifest_path = Path(__file__).with_name("modManifest.json")
    manifest = ModManifest.from_dict(json.loads(
        manifest_path.read_text(encoding="utf-8")
    ))
    from .mod import register

    register(ModRegistrar(manifest, registry))
