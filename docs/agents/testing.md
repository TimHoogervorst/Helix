# Testing

How to run this repo's tests. Backend tests use **pytest**; frontend tests use Vitest.

## Backend — full suite

Backend tests live in the Platform and mod trees:

- `src/helix_core/tests/` — Platform, `core`, and mentions tests
- `src/bundled/<section>/<id>/tests/` — Bundled Mod tests
- `src/mods/<id>/tests/` — optional External Mod tests; not part of the canonical suite

The canonical `pytest` suite excludes optional External Mods and disables External
Mod discovery. Platform integration tests use a small fake External Mod instead.
During implementation, prefer a focused run from the target tree, file, class, or
keyword below. After implementing a change, always run the full suite as a final check.

Full runs use `pytest-xdist` in parallel, use a higher 10-minute Docker exec timeout, and default to four workers when `auto` selects the worker count. `PYTEST_XDIST_AUTO_NUM_WORKERS` is supported by pytest-xdist for this purpose:

```bash
# Docker
docker-compose exec --timeout 600 backend pytest -n auto

# Local (no Docker) — from the repo root
cd src && pytest -n auto
```

Set the worker default before running the full suite:

```bash
# Bash
export PYTEST_XDIST_AUTO_NUM_WORKERS=4

# PowerShell
$env:PYTEST_XDIST_AUTO_NUM_WORKERS = "4"
```

Run it from `src/` (not `src/server/`): the `testpaths` in `src/pytest.ini` only take effect when pytest is invoked from the directory that holds the config.

Do **not** use `python manage.py test` — the Django runner needs pytest installed anyway (several `helix_core` tests import it) and it is not the canonical path.

### Target a run while implementing

The full suite is the slow path. When you're iterating on one area, target just the tree, mod, file, or a keyword so you don't pay for everything:

```bash
# Local (no Docker) — run from src/; paths are relative to src/
pytest helix_core/tests                                 # Platform tree
pytest bundled/lims/tests/test_api.py::LimsApiTests    # Bundled Mod class
pytest -k "mention"                                     # keyword match

# Optional ELN suite (requires installing the ELN package separately)
pip install -e src/mods/eln
pytest mods/eln/tests

# Docker — Bundled Mods are mounted at /bundled
docker-compose exec backend pytest /bundled/lims/tests/test_api.py::LimsApiTests  # Bundled Mod
docker-compose exec backend pytest -k "mention"         # keyword match
```

The focused paths above target the current Platform and Bundled Mod trees directly.
Drop `-n auto` for targeted runs — a single file or keyword doesn't benefit from
parallel workers and starts faster without them.

### Database: SQLite vs Postgres

The default Docker setup runs against PostgreSQL (`pgvector/pgvector:pg16`), which is what CI and the real app use. Prefer SQLite for quick local implementation and focused runs without Docker:

```bash
cd src
$env:DATABASE_URL = "sqlite:///local.db"   # PowerShell
pytest
```

`DATABASE_URL` accepts `sqlite:///local.db`, `sqlite://local.db`, or bare `sqlite` (falls back to `db.sqlite3`). Most suites pass on SQLite; a handful of tests depend on Postgres/pgvector behaviour and should be run in Docker.

## Frontend

```bash
npm test          # vitest run (from repo root)
npm run test:watch
```

## CI

`.github/workflows/test.yml` runs `pytest -n auto` against Postgres on every push/PR. When in doubt about "how tests actually run", that workflow is the source of truth.
