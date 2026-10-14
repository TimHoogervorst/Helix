# Testing

How to run this repo's tests. Backend tests use **pytest**; frontend tests use Vitest.

## Backend — full suite

Backend tests live in the Platform and mod trees:

- `src/helix_core/tests/` — Platform, `core`, and mentions tests
- `src/bundled/<section>/<id>/tests/` — Bundled Mod tests
- `src/mods/<id>/tests/` — optional External Mod tests; not part of the canonical suite

The canonical `pytest` suite discovers Platform and Bundled tests only. It does
not collect tests under `src/mods/`, and CI sets `HELIX_NO_EXTERNAL_MODS=1` so
runtime discovery does not load optional External Mod packages. Platform
integration tests use a small fake External Mod instead.
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
npm test          # build and consume Mod API artifacts, then run canonical Vitest suites
npm run test:watch
```

The canonical frontend suite includes Shell, Bundled Mod, and public Mod API
tests. It excludes all External Mod test trees. CI installs root dependencies
with `npm ci --workspaces=false`; developers can install the full workspace set
when they need optional application packages.

`npm test` builds `src/mod-api` before checking its declared package exports
against the files included by `npm pack --dry-run`, then tests those built
exports directly. The Vitest public-surface test separately exercises source
imports. This keeps source aliases from standing in for artifact consumption.

### Shell and shared UI test decisions (#677)

- The `makeMockMentionBadge` factory had no consumers outside its own tests, so the helper and its factory-contract suite were removed. The provider-backed `MentionBadge` component suite remains the behavior owner.
- Shell route tests combine repeated default/settings navigation checks. They retain registered destinations, settings selection, meaningful absence checks, responsive transitions, manual collapse, and sidebar interactions.
- `StatusBadge` retains exhaustive known, unknown, and empty status mapping. `BaseCard` focuses on parent composition, view modes, optional metadata, selection, and activation. `IconBadge` retains theme/fallback colors, palette resolution, unknown-icon fallback and warning behavior, actual custom SVG resolution, sizes, and click behavior while duplicate render/warning checks are removed.
- Formula parity fixtures remain in place because they compare the independent client evaluator against shared parity examples. No Shell-owned migration test file was found to retire.

The focused frontend validation for this slice passed 10 files and 191 tests with `npm test -- <focused Shell/shared UI paths>` from the repo root. This records the selected run only; test-count changes are not a coverage or speed measurement.

### Canonical discovery and Mod API artifacts (#679)

- Backend discovery targets `server`, `helix_core`, and `bundled`; it omits the
  entire External Mod tree. Unresolved mixed Platform files remain explicitly
  ignored until their restoration tickets remove those entries.
- Frontend discovery includes Shell, Bundled Mod, and public Mod API tests. It
  excludes every External Mod test tree.
- Backend CI disables External Mod discovery with `HELIX_NO_EXTERNAL_MODS=1`.
  Frontend CI installs root dependencies without installing workspace Mod
  packages, then runs the canonical `npm test` command.
- `src/mod-api/__tests__/public-surface.test.ts` checks source exports. The
  package test builds the library, verifies that `npm pack --dry-run` includes
  every runtime export, and imports the built export targets.

### Platform fixture and ownership decisions (#671)

The private fake package at `src/helix_core/tests/fixtures/external_mod/` owns
`ConcreteTestEntity`, its manifest, a content provider, one action, and a minimal
frontend hub. Consumers may extend it for their own contracts; it is not a public
testing API. Backend discovery uses real entry-point parsing with test metadata,
then public registration and persisted content. Shell tests use manifest/lazy
module globs and the real `ModLoader`, proving active contributions render and
absent active contributions leave no hub. No real External Mod is imported by
these integration tests.

- Keep all existing abstract-entity behavior checks. Move the concrete model out
  of the collected test module; create/drop its table through `django_db_setup`.
  Pure suites no longer request a database through an unconditional fixture.
- Move hello-world author/catalog/source checks to
  `src/mods/hello_world/tests/test_contract.py`. Its package defers registration
  imports so metadata/source inspection does not require installing its Django
  app. Run these example-owned checks explicitly, outside canonical discovery.
- Replace the hand-populated ELN registry matrix and package-presence assertion
  with real fixture boot and rendering. Backend discovery also verifies the
  genuinely absent package set retains Bundled Mods.

Focused checks from `src/`, with `DATABASE_URL=sqlite:///local.db`:

```bash
pytest helix_core/tests/test_external_mod_contract.py helix_core/tests/test_abstracts.py helix_core/tests/test_boot_sequence.py -q -p no:cacheprovider
pytest mods/hello_world/tests/test_contract.py -q -p no:cacheprovider
pytest helix_core/tests/test_boot_sequence.py -q --setup-show -p no:cacheprovider
```

The first run passed 20 tests, the example-owned run passed 3 tests, and the pure
boot run passed 2 tests without `django_db_setup`. The cache plugin was disabled
only for this sandbox: a faulthandler trace identified its session-finish
`tempfile.mkdtemp` as the source of filesystem-denial hangs after assertions had
passed. No test or database lifecycle exclusion was needed.

Frontend validation from `src/shell/`:

```bash
vitest run src/mod-system/__tests__/external-package.test.ts src/mod-system/__tests__/boot.test.ts src/mod-system/__tests__/ModLoader.test.tsx
```

This passed 3 files and 8 tests. These focused runs do not establish full-suite
independence; restoration and canonical-discovery slices own that remaining work.

## CI

`.github/workflows/test.yml` runs `pytest -n auto` against Postgres on every push/PR. When in doubt about "how tests actually run", that workflow is the source of truth.
