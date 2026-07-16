from helix_core.mod_system.manifest import ModManifest

manifest = ModManifest(
    id="library",
    display_name="Library",
    version="0.1.0",
    depends_on=["tags", "eln"],
)
