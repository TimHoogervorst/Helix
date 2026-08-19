# Formula Support — Cell Formulas and Computed Fields

> Origin: [Brainstorm: Formula support #511](https://github.com/TimHoogervorst/Helix/issues/511), prepared into a spec via a grilling session. Supersedes brainstorm decisions #2, #4 (partially), and #5. Builds on the Table Kit spec ([#492](https://github.com/TimHoogervorst/Helix/issues/492)).

## Problem Statement

Scientists entering measurements (e.g. NanoDrop absorbance readings) must currently compute derived values by hand or in a separate tool, then re-type the results. Tables in Helix have no calculation story:

1. **No schema-level derived columns.** A schema cannot declare "this column is `[A260]/[A280]`" — every derived value is manual transcription, which is error-prone and unauditable.
2. **No in-table calculation.** A user cannot compute anything inside a table cell — not even a quick ratio while arranging data before registration.
3. **A leftover interim implementation.** Result Schemas currently ship a `formula` column type that evaluates via a regex-allow-listed `new Function()` call in `ResultTableNode.tsx` — arithmetic-only, no functions, no error model, frontend-only validation. It survived the formula cut (commit `945971f`) and must be replaced.

The brainstorm converged on "the backend fully owns all formula logic." The grilling session overturned that: the ownership question splits cleanly by *who authors the formula and where its value lives*, not by a single owner for everything.

## Solution

Two formula forms sharing one grammar, one parser, and one function catalog — with a hard ownership split:

- **Cell Formulas** are the frontend's territory. The user types `=` into any editable cell of any table in an ELN entry. Evaluation uses exclusively registered client implementations, never touches the backend, and the resulting value is registered as-sent. The formula text lives in the document JSON and re-evaluates on open.
- **Computed Fields** are the backend's territory. An admin defines an expression on a schema column (a proper `formula` column type, available on all schemas). Cells are read-only. The backend validates the expression and computes the authoritative value at registration; client implementations provide a live, display-only preview.

The **Function Catalog** is the single source both forms draw from: every Formula Function is registered in the backend (definition + authoritative implementation), hydrates to the frontend via the mod registry API, and may optionally carry one client implementation as an optimization. Frontend-only functions do not exist.

Metrics are untouched — they remain SQL aggregates over Views. Formulas do not enter Metrics in this spec.

## User Stories

1. As a scientist entering NanoDrop readings, when my schema defines `Ratio = [A260]/[A280]`, I want the ratio to appear in every row as I type, so that I never compute or transcribe derived values by hand.
2. As a scientist, when a computed value comes from a function the frontend cannot evaluate locally, I want a row refresh action that fetches the backend-computed values, so that I still see the numbers before registering.
3. As a scientist registering rows, I want the registered entity values to always be the backend-computed ones, so that the numbers in the LIMS are authoritative regardless of what any browser previewed.
4. As a scientist arranging data in a Plain Table, when I type `=[A260]/[A280]` into a cell, I want the value computed instantly and re-computed every time I open the entry, so that my working tables stay live without any schema or registration.
5. As a scientist, when I insert or delete a row in a table whose cells use row references like `=[Blank:1]`, I want the references updated to keep pointing at the right row, so that my formulas don't silently change meaning.
6. As an organization admin editing a schema's expression, I want existing registered entities to keep their stored values (computed with the old expression) and to be visibly marked stale, so that audited numbers are never silently rewritten.
7. As an organization admin, after changing an expression, I want an explicit recompute action for the schema's entities, so that refreshing stored values is a deliberate act.
8. As a mod author, I want to register a domain function (e.g. `GC_CONTENT`) in my `mod.py` and have it usable in Computed Fields with no frontend code, so that extending the formula language needs only backend work.
9. As a mod author with a performance-critical function, I want to additionally register a client implementation, so that tables can preview it in real time while registration stays backend-authoritative.
10. As a scientist, when a formula divides by zero, I want a visible `#DIV/0!` error in the cell (preview) and a failed row registration with a clear message (registration), so that bad numbers never enter the LIMS silently.

## Implementation Decisions

### The two formula forms

| | Cell Formula | Computed Field |
|---|---|---|
| Authored by | User, in a cell (`=` prefix) | Admin, in schema settings (no `=` prefix) |
| Lives in | Document JSON (per-row formula map) | Schema column definition |
| Available in | Any editable value cell of any table (Plain, Registry, Result) | All schemas (Entity and Result), as the `formula` column type |
| References | `[Column]` (same row), `[Column:N]` (row N, 1-based data rows) | `[Column]` (sibling columns, same row) |
| Evaluation | Client implementations only — never the backend | Backend-authoritative; client preview when available |
| Persistence | Value registered as-sent; formula re-evaluates on open | Value computed by the backend at registration and stored with the expression version that produced it |

Cell Formula exclusions: Computed Field columns (read-only — owned by the schema) and reference/entity-picker columns (a formula cannot produce a valid entity reference). The Name column may hold a Cell Formula. A Cell Formula may **not** reference a Computed Field column — the frontend cannot know the authoritative value of a backend-owned field, and computing off a stale preview is exactly the divergence this design avoids.

Cell Formulas are document-local: they see the table's own rows including unregistered ones, and cannot reach other tables or entities.

### Shared grammar and error model

One grammar for both forms, descended from the deleted prototype (`git show 945971f^:src/shell/src/shared/formulas/formulaEngine.ts`):

- `[Column Name]` references; `[Column:N]` row references (Cell Formulas only); literals (number, string, boolean); arithmetic (`+ - * / % ^`), comparison (`= == != <> < <= > >=`), function calls.
- Error codes: `#SYNTAX!`, `#REF!`, `#DIV/0!`, `#NAME?`, `#VALUE!`, `#CYCLE!` — tagged results (`{ok, value}` / `{ok, error}`), never silent coercion to empty strings.
- Value model: `string | number | boolean | null`. Dates are not a formula value kind in v1 (see Out of Scope).
- Cycle detection applies to both forms: the cell-dependency graph for Cell Formulas (client-side), schema-level validation for Computed Fields (backend).
- Blank handling: incomplete inputs produce a silent placeholder — no request, no error flicker. Errors appear only for complete-but-invalid data.

Row-reference semantics for Cell Formulas: `[Column:N]` addresses data row N (1-based, header excluded). Row insert/delete rewrites references spreadsheet-style: inserting above shifts affected references down, deleting a row shifts references above the deleted row up, and references to the deleted row become `#REF!`. There is no row-reorder feature in the tables today; if one is added later, its rewrite semantics are defined then.

### The Function Catalog

The ownership rule:

1. **Definition** — every Formula Function (namespaced id, argument kinds, result kind, description) is registered in the backend via `register_formula_function()` on the mod surface. Platform defaults register in `helix_core` (formulas span ELN and LIMS; no single mod owns them). Mod functions use namespaced ids (`molBio.gcContent`); platform functions are plain (`SUM`).
2. **Authoritative implementation** — every function has exactly one backend (Python) implementation. There are no frontend-only functions: registration, recomputation, and any future server-side evaluation (e.g. Notification Rules on Metrics) must be able to rely on the backend implementation.
3. **Client implementation** — optional, at most one per function, registered in the frontend via `registerFormulaFunction(id, impl)`. Registrations are validated against the hydrated catalog: an unknown id logs a console warning and is ignored. A client implementation is an optimization — it must be behaviorally identical to the authoritative one, enforced by parity fixture tests (see Testing Decisions).

The catalog hydrates to the frontend as a new section of `GET /api/mod-registry/`, alongside column types — same boot-time discovery pattern (ADR-0008). The frontend registry exposes: the full catalog (for Computed Field editors and autocomplete) and the client-shadowed subset (for Cell Formula editing).

### The v1 function set

**Client implementations (the parity set)** — pure, per-row, deterministic:

- Operators: arithmetic and comparison (as above)
- Logic: `IF`, `IFERROR`, `AND`, `OR`, `NOT`
- Math: `ROUND`, `ABS`, `MIN`, `MAX`
- Aggregates (variadic over sibling values): `SUM`, `AVERAGE`, `COUNT`
- Text: `CONCAT`, `UPPER`, `LOWER`, `LEN`

**Backend-only additions** (usable in Computed Fields; in Cell Formulas they yield `#NAME?` with a hint until they gain client implementations):

- Math: `CEILING`, `FLOOR`, `MOD`, `SQRT`, `POWER`, `LOG`, `SIGN`
- Text: `TRIM`, `LEFT`, `RIGHT`, `MID`, `SUBSTITUTE`

**Deferred:** date/time functions (`NOW`, `TODAY`, `DATEDIFF`, …) — they need a date value kind, and `NOW()` recomputing on every re-registration drifts by design; lookup/reference traversal (reading a field of a referenced entity) — a different operation shape, own PR alongside the molBio mod work.

### Evaluation routing

**Cell Formulas** evaluate locally, always: the cell's formula text is parsed and evaluated against the table's current row values using client implementations. Editing the cell shows the formula text; committing shows the value; errors render as an in-cell badge. Autocomplete offers only client-shadowed functions.

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
4. Cell Formula values are plain values as far as the backend is concerned — registered as-sent; the backend never sees the formula text.

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
- Expression validation is backend-authoritative at schema save: references resolve to sibling columns, no self-reference, functions exist in the catalog, no cycles among the schema's Computed Fields. The ColumnEditor keeps its fast inline validation as UX, but the backend is the authority.
- Computed Field values are stored entity properties, so they are filterable and sortable in the Entities Hub like any other column.

### Removal of the interim implementation

- `ResultTableNode.tsx`'s `formulaValue()` (the `new Function()` evaluator) is deleted; Result Table formula columns evaluate via the new engine and registration contract.
- `ColumnEditor.tsx`'s frontend-injected `formula` type is deleted; the backend-registered column type replaces it.
- The deleted prototype engine (`git show 945971f^:src/shell/src/shared/formulas/formulaEngine.ts`) is the reference implementation for the grammar, error model, and topological evaluation — restored and extended, not reinvented.

### Where the code lives

- **Frontend engine** (parser, AST, evaluator, cell-dependency graph, error model): `src/shell/src/shared/formulas/` — shared by all table blocks.
- **Client implementations of the default set**: ship with the engine in the shell, registered at boot.
- **Backend engine** (mirroring grammar + authoritative implementations): `helix_core`, next to the column type registry.
- **Registration surface**: `register_formula_function()` added to the backend mod registration API; `registerFormulaFunction()` added to the frontend mod system registry.
- **Catalog hydration**: new section of the `GET /api/mod-registry/` payload.

### Demo scenario (acceptance)

No playground page — the feature is built for real, and the NanoDrop examples are created in the UI after implementation:

1. A NanoDrop Result Schema: inputs `A260`, `A280`, `Dilution`; Computed Fields `Ratio = [A260]/[A280]`, `Concentration = [A260]*50*[Dilution]`, `Quality = IF([Ratio]<1.8,"impure","ok")` — all client-shadowed, live preview while typing.
2. One Computed Field using a backend-only function (e.g. `SQRT([A260])`) to exercise the placeholder → row Refresh → gateway → patch-back path.
3. Register → values patch back → edit an input → orange status + dimmed computed cells → Refresh → re-register.
4. A Plain Table with typed Cell Formulas (`=[A260]/[A280]`, plus one `[Column:N]` reference) proving instant local evaluation, row-insert reference rewriting, and re-evaluation on entry reload.

## Testing Decisions

### Parity fixtures — the trust anchor

Dual implementations are only safe if equivalence is mechanically enforced. A shared set of fixture files (expression + row values + expected tagged result) lives in the repo and is consumed by **both** test suites: Vitest runs them against the TypeScript engine, pytest runs them against the Python engine. Any behavioral divergence between client and authoritative implementations fails CI on both sides. Fixtures cover: every v1 function, operator precedence, coercion rules, blank handling, and every error code.

### Modules tested

- **Frontend engine** — unit: parsing, evaluation, error codes, cycle detection, row-reference resolution and rewriting on insert/delete.
- **Backend engine** — unit: the same parity fixtures, plus schema expression validation (unknown columns, unknown functions, self-reference, cycles).
- **Catalog registration** — backend: `register_formula_function()` metadata in the mod registry payload; frontend: `registerFormulaFunction()` validation against the hydrated catalog (unknown id warns and is ignored).
- **Registration contract** — backend (extend `test_api.py` batch-register suites): computed values recomputed server-side, client-sent formula values ignored, per-row formula errors fail only that row, expression version recorded. Frontend (extend `ResultTableNode.test.tsx` / `RegistryTableNode.test.tsx`): patch-back of computed values, dimmed-stale cells on input change, Refresh menu item calling the gateway, Cell Formula store-as-sent.
- **Cell Formula document round-trip** — formula text persists in document JSON and re-evaluates on reload.

### Prior art for tests

- `ResultTableNode.test.tsx` — already asserts batch-register payloads with formula values; the same mock pattern extends to the new contract.
- `RegistryTableNode.test.tsx` — per-row success/error patch-back assertions (`row_index`, `entity_id`, `display_id`, `status`) extend directly to computed-value patch-back.

## Out of Scope

- **Formulas in Metrics.** Metrics remain SQL aggregates over Views (`AggregateMeta` / `query_builder.py` untouched). The brainstorm's compile-expressions-to-SQL idea and the "SQL-mappable" capability flag are dropped. Future note: Metrics may gain parameters for cross-row use cases (replicates mean±SD is served today by registering triplicates and using the existing `avg`/`stdev` aggregates).
- **Cross-row aggregation in Computed Fields** — they are per-row by definition.
- **Date/time functions and a date value kind** — value-model work plus `NOW()` recompute-drift semantics.
- **Lookup functions** (traversing a reference column into the referenced entity's fields) — own PR, timed with the molBio mod.
- **GC_CONTENT / TM demo functions** — belong to the molBio mod PR, which will use this spec's registration surface.
- **Plain Table computed columns** — Plain Tables have no schema and no registration; their formula story is Cell Formulas only.
- **Spreadsheet-style fill, ranges (`A1:A3`), and cell-address references** — the later table-formulas layer, if ever.
- **Row-reorder reference rewriting** — no reorder feature exists in the tables today.

## Further Notes

- The brainstorm's evaluate gateway survives in reduced form: it was the single code path for preview *and* registration; it is now preview-only (row Refresh), because registration computes through the same backend engine internally. The "one code path" CFR argument is preserved differently: stored values are *always* backend-computed, which is stronger than "previewed and stored by the same service."
- The retired term "table formulas" (brainstorm layer 3) is replaced by **Cell Formula**. Cell Formulas absorb that layer's defining property — seeing unregistered rows — without its dependency-graph-and-persistence complexity, because they never persist server-side.
- `AVERAGE` and `COUNT` follow the spreadsheet variadic semantics over sibling column values in the same row; they are not population aggregates. Population-level reduction is Metrics' job.
- The `[Column:N]` rewrite rules assume row identity is positional in the document JSON. If tables ever gain stable row ids, references could migrate to id-based addressing — that migration is a future concern.
- Store-as-sent for Cell Formulas means their registered values were computed client-side by fixture-verified implementations. This is the one deliberate trust delegation in the design, bounded by: the parity fixtures, the fact that only platform/mod-approved implementations can run (no user code), and the audit visibility of the formula text in the source document.
