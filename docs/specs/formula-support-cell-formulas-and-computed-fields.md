# Formula Support — Computed Fields

> Origin: [Brainstorm: Formula support #511](https://github.com/TimHoogervorst/Helix/issues/511), prepared into a spec via a grilling session. Supersedes brainstorm decisions #2, #4 (partially), and #5. Builds on the Table Kit spec ([#492](https://github.com/TimHoogervorst/Helix/issues/492)).

## Problem Statement

Scientists entering measurements (e.g. NanoDrop absorbance readings) must currently compute derived values by hand or in a separate tool, then re-type the results. Tables in Helix have no calculation story:

1. **No schema-level derived columns.** A schema cannot declare "this column is `[A260]/[A280]`" — every derived value is manual transcription, which is error-prone and unauditable.
2. **A leftover interim implementation.** Result Schemas currently ship a `formula` column type that evaluates via a regex-allow-listed `new Function()` call in `ResultTableNode.tsx` — arithmetic-only, no functions, no error model, frontend-only validation. It survived the formula cut (commit `945971f`) and must be replaced.

The formula system is backend-authoritative for stored Computed Field values. Optional client implementations provide display-only previews.

## Solution

**Computed Fields** are the backend's territory. An admin defines an expression on a schema column (a proper `formula` column type, available on all schemas). Cells are read-only. The backend validates the expression and computes the authoritative value at registration; client implementations provide a live, display-only preview.

The **Function Catalog** is the single source: every Formula Function is registered in the backend (definition + authoritative implementation), hydrates to the frontend via the mod registry API, and may optionally carry one client implementation as an optimization. Frontend-only functions do not exist.

Metrics are untouched — they remain SQL aggregates over Views. Formulas do not enter Metrics in this spec.

## User Stories

1. As a scientist entering NanoDrop readings, when my schema defines `Ratio = [A260]/[A280]`, I want the ratio to appear in every row as I type, so that I never compute or transcribe derived values by hand.
2. As a scientist, when a computed value comes from a function the frontend cannot evaluate locally, I want a row refresh action that fetches the backend-computed values, so that I still see the numbers before registering.
3. As a scientist registering rows, I want the registered entity values to always be the backend-computed ones, so that the numbers in the LIMS are authoritative regardless of what any browser previewed.
4. As an organization admin editing a schema's expression, I want existing registered entities to keep their stored values (computed with the old expression) and to be visibly marked stale, so that audited numbers are never silently rewritten.
5. As an organization admin, after changing an expression, I want an explicit recompute action for the schema's entities, so that refreshing stored values is a deliberate act.
6. As a mod author, I want to register a domain function (e.g. `GC_CONTENT`) in my `mod.py` and have it usable in Computed Fields with no frontend code, so that extending the formula language needs only backend work.
7. As a mod author with a performance-critical function, I want to additionally register a client implementation, so that tables can preview it in real time while registration stays backend-authoritative.
8. As a scientist, when a formula divides by zero, I want a visible `#DIV/0!` error in the cell (preview) and a failed row registration with a clear message (registration), so that bad numbers never enter the LIMS silently.
9. As an organization admin creating a Computed Field, I want to compose the expression in a dedicated editor with autocomplete and a test bench for sample values, so that I can verify the formula works before anyone enters data against it.

## Implementation Decisions

### Computed Fields

| Authored by | Admin, via the Formula Editor modal in schema settings |
| Lives in | Schema column definition |
| Available in | All schemas (Entity and Result), as the `formula` column type |
| References | `[Column]` sibling columns in the same row |
| Evaluation | Backend-authoritative; client preview when available |
| Persistence | Value computed by the backend at registration and stored with the expression version that produced it |

### Shared grammar and error model

One grammar for both forms, descended from the deleted prototype (`git show 945971f^:src/shell/src/shared/formulas/formulaEngine.ts`):

- `[Column Name]` references; literals (number, string, boolean); arithmetic (`+ - * / % ^`), comparison (`= == != <> < <= > >=`), function calls.
- Error codes: `#SYNTAX!`, `#REF!`, `#DIV/0!`, `#NAME?`, `#VALUE!`, `#CYCLE!` — tagged results (`{ok, value}` / `{ok, error}`), never silent coercion to empty strings.
- Value model: `string | number | boolean | null`. Dates are not a formula value kind in v1 (see Out of Scope).
- Cycle detection is validated at the schema level for Computed Fields (backend).
- Blank handling: incomplete inputs produce a silent placeholder — no request, no error flicker. Errors appear only for complete-but-invalid data.

### The Function Catalog

The ownership rule:

1. **Definition** — every Formula Function (namespaced id, argument kinds, result kind, description) is registered in the backend via `register_formula_function()` on the mod surface. Platform defaults register in `helix_core` (formulas span ELN and LIMS; no single mod owns them). Mod functions use namespaced ids (`molBio.gcContent`); platform functions are plain (`SUM`).
2. **Authoritative implementation** — every function has exactly one backend (Python) implementation. There are no frontend-only functions: registration, recomputation, and any future server-side evaluation (e.g. Notification Rules on Metrics) must be able to rely on the backend implementation.
3. **Client implementation** — optional, at most one per function, registered in the frontend via `registerFormulaFunction(id, impl)` for display-only previews. Registrations are validated against the hydrated catalog: an unknown id logs a console warning and is ignored. A client implementation must be behaviorally identical to the authoritative one, enforced by parity fixture tests.

The catalog hydrates to the frontend as a new section of `GET /api/mod-registry/`, alongside column types — same boot-time discovery pattern (ADR-0008). The frontend registry exposes the full catalog for Computed Field editors and autocomplete.

### The v1 function set

**Client implementations (the parity set)** — pure, per-row, deterministic:

- Operators: arithmetic and comparison (as above)
- Logic: `IF`, `IFERROR`, `AND`, `OR`, `NOT`
- Math: `ROUND`, `ABS`, `MIN`, `MAX`
- Aggregates (variadic over sibling values): `SUM`, `AVERAGE`, `COUNT`
- Text: `CONCAT`, `UPPER`, `LOWER`, `LEN`

**Backend-only additions** (usable in Computed Fields; these show a placeholder until the row is refreshed):

- Math: `CEILING`, `FLOOR`, `MOD`, `SQRT`, `POWER`, `LOG`, `SIGN`
- Text: `TRIM`, `LEFT`, `RIGHT`, `MID`, `SUBSTITUTE`

**Deferred:** date/time functions (`NOW`, `TODAY`, `DATEDIFF`, …) — they need a date value kind, and `NOW()` recomputing on every re-registration drifts by design; lookup/reference traversal (reading a field of a referenced entity) — a different operation shape, own PR alongside the molBio mod work.

### Evaluation routing

**Computed Fields** route by expression content:

- Every function in the expression has a client implementation → live preview as inputs are typed (display-only — the number shown is never the number stored; the backend recomputes at registration).
- The expression contains any backend-only function → the cell shows a placeholder; the row's three-dot menu gains a **Refresh** item that recomputes the whole row's Computed Fields via the evaluate gateway — `POST /api/formulas/evaluate/`, row-scoped batch: expressions + row values in, tagged results out. When inputs change, fetched values render dimmed (stale) until the next refresh. No automatic requests, no debouncing.
- Inputs incomplete → silent placeholder (no request, no spinner).

The gateway is display-only infrastructure: it never produces stored values. Stored values come exclusively from the registration path.

### The registration contract

At `POST /api/lims/entities/batch-register/`:

1. The client sends row input values. Values it sends for Computed Field cells are ignored — the backend recomputes every Computed Field column from the inputs using the authoritative implementations.
2. The per-row result (`row_index`, `entity_id`, `display_id`, `status`) is extended with the computed values. The table patches them back into the document, exactly like display IDs today — so backend-only cells get their values even if the user never clicked Refresh, and any client/backend divergence resolves to the backend's number.
3. A Computed Field that errors server-side fails **that row's** registration with a per-row error in the existing shape (`row_index`, `field`, `message`), rendered as the row's red error status. Partial success is preserved — other rows register normally.

After registration, the table displays the patched backend values and converges to the stored truth. Editing an input turns the row's status back to changed-since-registration (orange) and dims stale computed cells.

### Expression staleness and versioning

Registered values are immutable history. Each Computed Field column carries an `expression_version` (monotonic, bumped when an admin edits the expression); a registered entity's computed property records the version that produced it. Consequences:

- Editing an expression changes the schema content hash → existing table rows show the **existing** yellow "schema has changed since last registration" indicator. No new staleness machinery — the registration/result tables' stale-record logic surfaces it.
- Re-registration recomputes with the new expression and stores the new value with the new version.
- An explicit admin action ("recompute") re-runs the schema's registered entities through the backend engine for rows not re-registered from a table. Nothing recomputes silently.
- The stored value + its expression version is the CFR Part 11 story: any registered number can be shown to be the product of a specific expression.

### The `formula` column type

Computed Fields are a proper column type registered in the backend column type registry (`helix_core`), not the frontend-injected pseudo-type that `ColumnEditor.tsx` adds for result schemas today (that injection is removed). Consequences:

- Available on **all** schemas — Entity and Result — through the standard column editor.
- Column definition carries `expression`, `resultType`, and `expression_version`.
- Cells render read-only through the declared `resultType`'s operand shape (the existing `shape()` resolution in the table nodes already does this).
- Expression editing happens exclusively in the Formula Editor modal (below); validation runs live in the modal and the backend is authoritative at schema save: references resolve to sibling columns, no self-reference, functions exist in the catalog, no cycles among the schema's Computed Fields.
- Computed Field values are stored entity properties, so they are filterable and sortable in the Entities Hub like any other column.

### Formula Editor modal

Computed Fields are set up through a modal, not an inline input in the column editor:

- The column row shows the expression as a **read-only summary** plus an **Fx button** (sigma icon — the same icon as the column type badge). The button opens the Formula Editor modal; there is no inline expression text input, so the modal is the expression's only editing surface. For a newly created Computed Field column, the button opens the modal on an empty expression.
- The modal contains three things:
  1. **Expression input with autocomplete** — sibling column names and functions from the **full** Function Catalog (Computed Fields may use backend-only functions), each function with its signature and description from catalog metadata.
  2. **Live validation panel** — syntax errors, unknown references, self-reference, cycles: the same rules the backend enforces at schema save, shown while composing.
  3. **Test bench** — one sample-value input per referenced column and an evaluate action that runs the expression against the samples, so an admin can sanity-check an expression before any table exists. The test bench calls the evaluate gateway — one explicit request, works for every function, consistent with backend authority.
- The modal is a single component with one consumer in v1 (the LIMS schema settings).

### Removal of the interim implementation

- `ResultTableNode.tsx`'s `formulaValue()` (the `new Function()` evaluator) is deleted; Result Table formula columns evaluate via the new engine and registration contract.
- `ColumnEditor.tsx`'s frontend-injected `formula` type is deleted; the backend-registered column type replaces it.
- The deleted prototype engine (`git show 945971f^:src/shell/src/shared/formulas/formulaEngine.ts`) is the reference implementation for the grammar, error model, and topological evaluation — restored and extended, not reinvented.

### Where the code lives

- **Frontend engine** (parser, AST, evaluator, error model): `src/shell/src/shared/formulas/` — shared by table blocks for Computed Field previews.
- **Client implementations of the default set**: ship with the engine in the shell, registered at boot.
- **Backend engine** (mirroring grammar + authoritative implementations): `helix_core`, next to the column type registry.
- **Registration surface**: `register_formula_function()` added to the backend mod registration API; `registerFormulaFunction()` added to the frontend mod system registry.
- **Catalog hydration**: new section of the `GET /api/mod-registry/` payload.
- **Formula Editor modal**: with the LIMS schema settings (its only v1 consumer), built on the shared engine and the hydrated catalog metadata.

### Demo scenario (acceptance)

No playground page — the feature is built for real, and the NanoDrop examples are created in the UI after implementation:

1. A NanoDrop Result Schema: inputs `A260`, `A280`, `Dilution`; Computed Fields `Ratio = [A260]/[A280]`, `Concentration = [A260]*50*[Dilution]`, `Quality = IF([Ratio]<1.8,"impure","ok")` — each authored through the Formula Editor modal (autocomplete + test bench against sample readings) — all client-shadowed, live preview while typing.
2. One Computed Field using a backend-only function (e.g. `SQRT([A260])`) to exercise the placeholder → row Refresh → gateway → patch-back path.
3. Register → values patch back → edit an input → orange status + dimmed computed cells → Refresh → re-register.

## Testing Decisions

### Parity fixtures — the trust anchor

Dual implementations are only safe if equivalence is mechanically enforced. A shared set of fixture files (expression + row values + expected tagged result) lives in the repo and is consumed by **both** test suites: Vitest runs them against the TypeScript engine, pytest runs them against the Python engine. Any behavioral divergence between client and authoritative implementations fails CI on both sides. Fixtures cover: every v1 function, operator precedence, coercion rules, blank handling, and every error code.

### Modules tested

- **Frontend engine** — unit: parsing, evaluation, error codes, and Computed Field dependency cycles.
- **Backend engine** — unit: the same parity fixtures, plus schema expression validation (unknown columns, unknown functions, self-reference, cycles).
- **Catalog registration** — backend: `register_formula_function()` metadata in the mod registry payload; frontend: `registerFormulaFunction()` validation against the hydrated catalog (unknown id warns and is ignored).
- **Registration contract** — backend (extend `test_api.py` batch-register suites): computed values recomputed server-side, per-row formula errors fail only that row, expression version recorded. Frontend (extend `ResultTableNode.test.tsx` / `RegistryTableNode.test.tsx`): patch-back of computed values, dimmed-stale cells on input change, and Refresh menu behavior.
- **Formula Editor modal** — opens from the Fx button, read-only summary reflects the saved expression, autocomplete offers sibling columns + full catalog, validation panel surfaces each rule (unknown reference, self-reference, cycle), test bench calls the evaluate gateway and renders the tagged result.

### Prior art for tests

- `ResultTableNode.test.tsx` — already asserts batch-register payloads with formula values; the same mock pattern extends to the new contract.
- `RegistryTableNode.test.tsx` — per-row success/error patch-back assertions (`row_index`, `entity_id`, `display_id`, `status`) extend directly to computed-value patch-back.

## Out of Scope

- **Formulas in Metrics.** Metrics remain SQL aggregates over Views (`AggregateMeta` / `query_builder.py` untouched). The brainstorm's compile-expressions-to-SQL idea and the "SQL-mappable" capability flag are dropped. Future note: Metrics may gain parameters for cross-row use cases (replicates mean±SD is served today by registering triplicates and using the existing `avg`/`stdev` aggregates).
- **Cross-row aggregation in Computed Fields** — they are per-row by definition.
- **Date/time functions and a date value kind** — value-model work plus `NOW()` recompute-drift semantics.
- **Lookup functions** (traversing a reference column into the referenced entity's fields) — own PR, timed with the molBio mod.
- **GC_CONTENT / TM demo functions** — belong to the molBio mod PR, which will use this spec's registration surface.
- **Plain Table computed columns** — Plain Tables have no schema and no registration.
- **Spreadsheet-style fill, ranges (`A1:A3`), and cell-address references** — the later table-formulas layer, if ever.
- **Row-reorder reference rewriting** — no reorder feature exists in the tables today.

## Further Notes

- The brainstorm's evaluate gateway survives in reduced form: it was the single code path for preview *and* registration; it is now preview-only (row Refresh), because registration computes through the same backend engine internally. The "one code path" CFR argument is preserved differently: stored values are *always* backend-computed, which is stronger than "previewed and stored by the same service."
- `AVERAGE` and `COUNT` follow the spreadsheet variadic semantics over sibling column values in the same row; they are not population aggregates. Population-level reduction is Metrics' job.
