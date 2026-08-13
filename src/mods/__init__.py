"""Helix core mods package.

Each subpackage is a self-contained mod (frontend + backend). The backend
mod loader discovers mods from ``mods/*/mod.py`` (or ``modManifest.json``)
and registers them into ``INSTALLED_APPS`` as dotted paths like ``mods.eln``.
"""
