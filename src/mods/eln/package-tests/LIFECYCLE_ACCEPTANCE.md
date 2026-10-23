# ELN D2–D4 same-data acceptance run

This runbook keeps D2, removal, and replacement on the same PostgreSQL and
media volumes. Run it only from a disposable independent Helix deployment
checkout. Do not run it in a developer checkout containing work in progress.

The lifecycle compose override must be used for **every** phase, with one
unchanged `COMPOSE_PROJECT_NAME`. It mounts a named media volume and uses
`acceptance-entrypoint.sh`: startup runs Django migrations and their normal
post-migrate contract-retention/activation hooks, then starts the server. It
does not run `makemigrations`, fixture seeding, flush, reset, or cleanup.

## Readiness and race checks

Before D2, run the non-mutating readiness check from the checkout that owns
both compose files. It checks the Docker CLI, daemon, merged Compose config,
and current service status; it does not start services or inspect/delete
volumes:

```sh
python src/mods/eln/package-tests/lifecycle_acceptance.py preflight \
  --checkout /path/to/independent/checkout \
  --compose-project helix-eln-d2d4-2026-10
```

If this fails at `Docker daemon`, resolve Docker Desktop/Engine availability
before starting D2. In particular, a Windows named-pipe error means the
acceptance run has not started; it is not evidence for D3 or D4.

The Platform race suites use independent PostgreSQL connections and row locks.
From `src/`, run them against the same disposable PostgreSQL service used for
acceptance:

```sh
pytest helix_core/tests/test_platform_action_invocations_postgres.py \
  helix_core/tests/test_platform_attachments_postgres.py -q
```

SQLite runs skip these PostgreSQL-only cases and cannot establish their race
guarantees. The D2-D4 run below is a separate live-data acceptance; passing
the unit race suites does not count as completing it.

## D2: create and capture the real data

1. In the independent deployment checkout, set a run-specific project name
   once, for example `COMPOSE_PROJECT_NAME=helix-eln-d2d4-2026-10`.
2. Start the services with both compose files and let the database health
   check pass:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.lifecycle.yml up --build -d
   ```

3. Create the acceptance account and scientific data through the running UI
   and API: narrative with multiple document Revisions, registered and
   unregistered Registry Table rows, files, and a reviewed Historical
   Rendition. Save the resulting Platform record IDs and an authenticated
   Platform API token. Do not recreate these records in later phases.
4. Keep the acceptance utility and evidence outside the deployment checkout.
   Copy `src/mods/eln/package-tests/lifecycle_acceptance.py` before removal.
   Capture all user-owned PostgreSQL tables (including operational tables):

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.lifecycle.yml exec -T db \
     psql -U openscience -d openscience -Atc \
     "select schemaname || '.' || tablename from pg_tables where schemaname not in ('pg_catalog','information_schema') order by 1" \
     > /path/outside/checkout/d2-table-names.txt
   ```

   Convert those lines to `{"tables": ["schema.table", ...]}` in
   `/path/outside/checkout/d2-tables.json`. Store the record IDs in a comma
   separated list. Capture authenticated public API evidence:

   ```sh
   HELIX_ACCEPTANCE_TOKEN=... python lifecycle_acceptance.py capture \
     --api http://localhost:8000 --record-ids id1,id2,id3 \
     --checkout /path/to/independent/checkout --compose-project helix-eln-d2d4-2026-10 \
     --tables /path/outside/checkout/d2-tables.json \
     --renditions /path/outside/checkout/d2-rendition-refs.json \
     --evidence /path/outside/checkout/d2-evidence.json
   ```

   Before removal, query each entry's `/api/eln/entries/{display_id}/renditions/`
   endpoint and put every retained PDF in `d2-rendition-refs.json` as
   `[ {"record_id":"...", "revision_id":"...", "attachment_id":"..."} ]`.
   Get `attachment_id` from that response's `download_url`. The utility
   downloads each file through the generic Platform exact-Revision route and
   stores its digest separately from ordinary document attachments.

   The capture command also inspects the running `db` and `backend` containers
   and stores their actual named Postgres/media volume names. Later phases
   fail if either differs. The bundle records Platform identity/state, current field values and bindings,
all groups and exact Revisions, Action activity associations, structured
exports and contract closure, downloaded attachment SHA-256/lengths, and the
entire table inventory. Each attachment is checked against its retained
metadata digest while capturing.

## D3: remove ELN and verify the retained data

Stop only the app services. Physically move the complete ELN package directory
out of the independent checkout (it contains both the frontend and backend
distributions); keep that backup outside Docker build contexts. Rebuild and
recreate only the app services with the same compose project name and both
compose files:

```sh
docker compose -f docker-compose.yml -f docker-compose.lifecycle.yml stop backend frontend
# Move src/mods/eln out of the disposable checkout here; do not delete it.
docker compose -f docker-compose.yml -f docker-compose.lifecycle.yml build --no-cache backend frontend
docker compose -f docker-compose.yml -f docker-compose.lifecycle.yml up -d --force-recreate --renew-anon-volumes backend frontend
```

Do not run `down -v`, change the project name, replace the Postgres/media
volume, or run seed/reset commands. The app startup still runs migrations and
post-migrate hooks. Confirm backend unavailability directly in the rebuilt
container:

```sh
docker compose -f docker-compose.yml -f docker-compose.lifecycle.yml exec -T backend \
  python -c "import importlib.util; assert importlib.util.find_spec('mods.eln') is None"
```

Confirm the former Vite module path is unavailable (`GET
http://localhost:5173/src/mods/eln/index.ts` must return 404), and the generic
Platform record routes remain available. Refresh the table-name JSON using the
same query, then compare against D2:

```sh
HELIX_ACCEPTANCE_TOKEN=... python lifecycle_acceptance.py verify \
  --api http://localhost:8000 --tables /path/outside/checkout/d3-tables.json \
  --checkout /path/to/independent/checkout --compose-project helix-eln-d2d4-2026-10 \
  --frontend-url http://localhost:5173 \
  --evidence /path/outside/checkout/d2-evidence.json
```

`verify` first execs into both rebuilt app containers. It proves the backend
ELN source path and `helix.mods` entry point are absent and `mods.eln` cannot
be imported; it proves the frontend source path is absent and
`@helix/eln` cannot resolve; it also requires Vite to return 404 for the old
entry module. Only after those checks does it call the Platform APIs.

This phase requires exact equality of record identities, values/bindings,
contract closure, all Revision IDs and hashes, Action associations, exports,
downloaded file hashes, record count, and every database table name. Run the
same verification as each authorized user role in the D2 permission matrix;
expected denials should remain denials.

## D4: install a separate compatible replacement

Prepare a separate replacement checkout outside the deployment checkout. It
must declare the exact retained contract versions, provide required validators,
and implement the public Action/Block/editor interfaces. Prepare a valid
Platform invocation JSON file whose explicit Schema and field-ID mapping reads
the saved unregistered rows and proposes the created records plus document
reference update. Prepare four negative requests for invalid mapping,
incompatible Action version, incompatible target role/effect, and missing
required validator. Each request must fail without effects. The expected-results JSON shape is:

```json
{
  "provider": {
    "modId": "acme.eln-replacement",
    "modVersion": "1.0.0",
    "actionId": "registry-register",
    "contractId": "helix.lims.registry-register",
    "contractVersion": "1.0.0"
  },
  "contracts": [
    {"kind": "action", "id": "helix.lims.registry-register", "version": "1.0.0", "fingerprint": "<retained-sha256>"}
  ],
  "preservedRecordIds": ["<previously-registered-record-id>"],
  "createdRecords": [
    {"key": "row-2", "schemaId": 12, "fieldValues": {"field-id": {"type": "string", "value": "saved value"}}, "metadata": {}}
  ],
  "documentUpdates": [
    {"recordId": "<document-record-id>", "groupId": "<document-group-id>",
     "beforeRevisionId": "<d2-current-revision>", "revisionId": "<new-document-revision>",
     "expectedSnapshot": {"document": {"type": "doc", "content": []}}}
  ],
  "roundTripCommand": ["npm", "run", "acceptance:round-trip"],
  "roundTrip": {
    "recordId": "<document-record-id>", "groupId": "<document-group-id>",
    "beforeRevisionId": "<post-registration-revision>", "revisionId": "<editor-save-revision>",
    "expectedSnapshot": {"document": {"type": "doc", "content": []}},
    "unsupportedJsonPointers": ["/document/content/3"]
  }
}
```

Then run the D4 orchestrator from the copied acceptance utility. It copies the
separate package into a new Mod directory, rebuilds/restarts backend and
frontend under the same compose project, checks that the replacement is
active and its frontend entry is served, proves the original ELN remains
absent, sends each rejection case and compares the entire D2 evidence before
continuing, then sends the valid request. The outcome must have one Action,
created-record participants, and one document participant whose before/after
Revision IDs match the expected transition. Each created record's exact
Schema, values, provenance, and Action association are checked over Platform
HTTP. Existing registered records are compared against D2; the source
Activity may gain only the registration Action, which proves no producer
Action ran. Finally the orchestrator runs `roundTripCommand` from the separate
package and checks the exact saved Revision snapshot, including unsupported
nested siblings.

```sh
HELIX_ACCEPTANCE_TOKEN=... python lifecycle_acceptance.py replace \
  --api http://localhost:8000 \
  --checkout /path/to/independent/checkout \
  --compose-project helix-eln-d2d4-2026-10 \
  --replacement-package /path/to/separate/replacement/package \
  --replacement-folder eln_compatible \
  --replacement-mod-id acme.eln-replacement \
  --tables /path/outside/checkout/d4-table-names.json \
  --evidence /path/outside/checkout/d2-evidence.json \
  --rejection-cases /path/outside/checkout/rejection-cases.json \
  --invocation /path/outside/checkout/register-saved-rows.json \
  --expected-results /path/outside/checkout/d4-expected.json \
  --output /path/outside/checkout/d4-results.json
```

The replacement's `acceptance:round-trip` command must exercise its real editor
against the running deployment and preserve unsupported content through an
actual load/edit/save. The orchestrator checks its resulting exact Platform
Revision. Incompatible versions/effects and missing required validation must
also be covered by that package's rejection cases.

The D2 evidence is intentionally not regenerated after removal. No acceptance
phase drops tables, resets data, or seeds replacement fixtures.
