from helix_core.mod_system.manifest import ModManifest

manifest = ModManifest(
    id="eln",
    display_name="Electronic Lab Notebook",
    version="0.1.0",
    depends_on=["lims", "tags"],
)
