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
# Docker (Postgres)
docker-compose exec -T backend pytest -n auto

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
  entire External Mod tree. Platform and Bundled suites are restored to normal
  discovery without ELN imports or collected-test exclusions.
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
`ConcreteTestEntity`, its manifest, an `entry` provider, one action, and a minimal
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

### Mentions and Library integration (#675)

Mentions API, prefix resolution, and synchronization use the Platform-owned
fixture entity and schema. The sync test owns cleanup for its dynamically
registered model's generic-relation rows. Library API tests register the same
fixture as an `entry` provider and cover listing, pagination, navigation,
search, metadata, and shared-folder permissions. The LibraryHub test uses an
explicit `WorkspaceReference` and fixture registration instead of ELN mocks.

The local SQLite run passed all 43 non-shared-folder API and mention tests.
Seven shared-folder cases require Postgres because visibility queries use the
JSON `contains` lookup. The focused LibraryHub frontend suite passed 91 tests.

### Entity Hub, registry, and query tests (#674)

The Entity Hub and scoping integration suites register the private `external_mod`
fixture package and exercise its generic `ConcreteTestEntity`. They do not
import ELN or LIMS models. The Mod Registry tests use the same fixture schema and
validate the response against the current registry contract. The response
schema excludes reserved catalog arrays from its workspace pattern and reflects
the current schema-type capabilities and nullable provider mod identifier.

Query-builder rule matrices (filter parsing, operator-to-`Q` construction,
column mapping, and filter composition) use `unittest.TestCase`, so they run
without Django database setup. ORM integration cases apply generated filters to
the fixture entity model; the former `EntityHubView` no longer exists. Project
filtering remains covered against fixture entities.

Scenario dispositions: Entity Hub coverage is consolidated into nine endpoint
tests spanning response shape, pagination, search, schema/status/property
filters, sorting, dynamic columns, and empty providers. Registry assertions that
depended on ELN/LIMS are represented by generic fixture metadata and schema
checks. The fixture's custom action is covered by the #671 platform fixture
contract. No pure filter-rule scenario was removed; the redundant no-project
filter integration case was removed because the pure empty-filter case already
asserts that behavior. Scoping remains a database-backed integration matrix.

Focused validation after integrating `e13ca90`: the four Entity Hub, scoping,
Mod Registry, and query-builder suites passed on Postgres (124 passed, 2
subtests, 9 warnings). The pure query-builder selection passed 68 tests with
`--setup-show`; it did not request `django_db_setup`. SQLite is unsuitable for
the scoping subset because its backend does not support the JSON `contains`
lookup used by share visibility; the full focused run passes on Postgres.

### Remaining Bundled Mod test review (#678)

- `settings`: Remove the fixed `DELETE ALL ENTRIES` action because it calls the External Mod-owned `/eln/entries/delete_all/` endpoint. The platform-wide delete operation continues to use the registry-backed endpoint, which already enumerates registered content providers. The Dev Tools suite now asserts that built-in cleanup choices render without that optional Mod. No generic developer-action contribution API exists, so no new registration surface was added.
- `shared/home`: Remove unused ELN and LIMS `SchemaType` rows from `CardSeedTests`; the seed behavior under test reads LIMS views and metrics, not schema types. The test now asserts the one Platform-owned card available without External Mods; the optional entry card is created only when its view/metric contribution exists. Keep home API, card formatting, and hub-composition scenarios because they verify distinct public behavior.
- `datatypes/dropdowns`: Remove `test_different_values_may_differ`; its description allows collisions but its assertions only checked non-null indices, so it protected no behavior. Keep deterministic output, palette shape/bounds, API CRUD, authorization, and action logging coverage. During test startup the lifecycle table can be unavailable before migrations; `HelixCoreConfig.ready()` now registers the bundled set in that case, matching its active-by-default lifecycle contract.
- `labelling/tags`: Keep API, autocomplete, picker, pill, settings, and hook suites. They cover CRUD, selection, search, and tag rendering at their respective boundaries; no ELN package import is needed.
- `tabs`: Keep pin/history persistence, navigation, responsive/layout transitions, and identity-migration behavior. Existing ELN strings are inert workspace IDs and route examples used to exercise registry-driven path resolution; the suites do not import or install the ELN package.
- `shared/entities`: Keep entity filtering, sorting, cell display, linking, and registration behavior. ELN schema IDs occur as input examples only; no ELN model or runtime package is loaded.
- `lims`: API, model, access, workspace, and registry-table suites remain LIMS-owned. Detailed cleanup is tracked by #676.
- `access`: API, policy, grant, audit, user-management, and UI scenarios remain access-owned. Their restoration and consolidation decisions are tracked by #672.

Focused frontend validation from `src/shell/` passed 10 files and 84 tests across Settings, dropdowns, and Tabs. The focused dropdown API and color-utility run passed 33 tests under `HELIX_NO_EXTERNAL_MODS=1` and SQLite after restoring bundled routes when the lifecycle table is unavailable. The Home card-seeding run passed 7 tests under the same environment.

### LIMS model, API, and Registry Table decisions (#676)

- Restore `test_models.py` to canonical discovery without importing ELN. Keep Entity display-ID generation, per-prefix counters, uniqueness, generic Folder source assignment, and Project fallback. Remove NotebookEntry status-cascade and ELN source examples; the cascade is already covered by `src/mods/eln/tests/test_cascade.py`, which owns that integration behavior.
- Keep LIMS API assertions at the consuming boundary for schema selection, saved property values, row/field error mapping, partial success, and the rule that unknown columns are ignored. Move primitive number/date/datetime/boolean/dropdown/reference/text acceptance matrices to the shared `helix_core/tests/test_column_types.py` owner. Remove redundant successful number and lowercase-type API cases; shared validator tests cover those rules.
- Remove duplicate unauthenticated create and batch-register checks from the LIMS API suite; `bundled/lims/tests/test_access.py` retains endpoint authorization coverage. Its denied edits, outside-subtree moves, and cross-project move cases assert persisted state remains unchanged.
- Route LIMS API tests through a small test URLConf that explicitly includes the LIMS routes. The application URL list is lifecycle-dependent during test startup, so direct API tests must not silently exercise 404s when ModInstallation state is absent.
- Remove the unused ELN SchemaType from MetricSeedTests. The seed defines one LIMS view and its count metric; tests now look up that exact view/metric and check the author `is_me` filter and idempotence.
- Consolidate repeated loaded Registry Table rendering assertions into one fixture-driven case while retaining the boolean registry icon, empty state, and independent error/interaction scenarios. Remove a weaker duplicate orange-status test and make red-over-green and orange-over-green precedence fixtures satisfy the competing state their names claim.

Focused local validation with `HELIX_NO_EXTERNAL_MODS=1` and SQLite passed: model tests, a LIMS create route smoke test, batch-register integration cases, and metric seed cases (13 passed). The RegistryTableNode frontend suite passed 95 tests. These are focused checks, not a full LIMS or repository run.

### Full integration and ownership accounting (#680)

The root `conftest.py` owns the test-only fixture table lifecycle, while pytest
configuration and `conftest.py` are mounted into Docker so local, Docker, and CI
collect the same `server`, `helix_core`, and `bundled` trees. Bundled routes are
refreshed in place after registration, so URLConfs imported before Django app
startup still see active contributions. LIMS metric aggregation uses the
registered source model instead of the retired `entity_hub_view`; Library skips
unresolved optional providers through the registry's resolvable-model API.

Final canonical validation on this integration branch:

- `docker-compose exec -T backend pytest -n auto -p no:cacheprovider`: 1,447
  passed on Postgres.
- `npm test` (with the npm cache inside the workspace for this sandbox): 97
  files and 1,587 tests passed, including both Mod API package-artifact checks.
- `git diff --check`: clean.

No test-count or runtime improvement is claimed; the result verifies restored
coverage and canonical discovery with optional External Mod packages absent.
