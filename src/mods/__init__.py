"""External Mods package.

Each subpackage is a self-contained external mod (frontend + backend). The
backend loader discovers packages from ``mods/*/mod.py`` (or
``modManifest.json``) and registers them into ``INSTALLED_APPS`` as dotted
paths such as ``mods.eln``. Bundled Mods live under ``bundled/`` and are
explicitly enumerated instead.
"""
