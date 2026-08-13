# Testing

How to run this repo's tests. Backend tests use **pytest**; frontend tests use Vitest.

## Backend — one command, everything

Backend tests live in two trees:

- `src/server/` — `helix_core`, `core`, `users`, `core/mentions`
- `src/mods/<id>/tests/` — every mod (`eln`, `lims`, `library`, `access`, `tags`, `home`, `dropdowns`, `users`, `tabs`)

`pytest` is configured (in `src/pytest.ini`) to collect **both** trees. The full run is parallelized with `pytest-xdist` (`-n auto` uses one worker per CPU core), which cuts the ~10 min serial run down to a few minutes on multicore machines:

```bash
# Docker
docker-compose exec backend pytest -n auto

# Local (no Docker) — from the repo root
cd src && pytest -n auto
```

Run it from `src/` (not `src/server/`): the `testpaths` in `src/pytest.ini` only take effect when pytest is invoked from the directory that holds the config, so `pytest` from `src/server/` would silently collect just the server tree.

Do **not** use `python manage.py test` — the Django runner needs pytest installed anyway (several `helix_core` tests import it) and it is not the canonical path.

### Target a run (skip the full suite)

The full suite is the slow path. When you're iterating on one area, target just the tree, mod, file, or a keyword so you don't pay for everything:

```bash
# Local (no Docker) — run from src/; paths are relative to src/
pytest server                                           # just the server tree (~850 tests)
pytest mods/eln/tests                                   # one mod
pytest mods/lims/tests/test_api.py::LimsApiTests        # one class
pytest -k "mention"                                     # keyword match

# Docker — mod trees are mounted at /mods
docker-compose exec backend pytest /mods/eln/tests      # one mod
docker-compose exec backend pytest /mods/lims/tests/test_api.py::LimsApiTests  # one class
docker-compose exec backend pytest -k "mention"         # keyword match
```

`pytest server` and `pytest mods/<id>/tests` match the two `testpaths` entries, so they're the fastest way to scope a run. Drop `-n auto` for targeted runs — a single file or keyword doesn't benefit from parallel workers and starts faster without them.

### Database: SQLite vs Postgres

The default Docker setup runs against PostgreSQL (`pgvector/pgvector:pg16`), which is what CI and the real app use. For a quick local run without Docker, use SQLite:

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
