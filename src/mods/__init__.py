"""External Mods package.

Each subpackage is a self-contained external mod (frontend + backend). The
backend loader discovers installed package distributions through the
``helix.mods`` entry-point group and registers their package roots into
``INSTALLED_APPS``. Bundled Mods live under ``bundled/`` and are explicitly
enumerated instead.
"""
