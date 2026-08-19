# ADR-0019: Formula Evaluation Ownership — Backend-Authoritative Computed Fields, Frontend-Only Cell Formulas

> Date: 2026-08-19
> Status: Accepted
> Origin: grilling session on [Brainstorm: Formula support #511](https://github.com/TimHoogervorst/Helix/issues/511); spec at [docs/specs/formula-support-cell-formulas-and-computed-fields.md](../specs/formula-support-cell-formulas-and-computed-fields.md)

Formulas split by authorship, not by a single owner: **Computed Fields** (schema-authored columns) are backend-authoritative — validated and computed by the backend at registration, with client implementations as display-only previews — while **Cell Formulas** (user-typed `=` expressions in table cells) are frontend-only, evaluate with client implementations exclusively, and register their values as-sent. Every formula function is defined once in the backend catalog with one authoritative backend implementation and at most one optional client implementation; frontend-only functions do not exist.

## Considered Options

- **Backend owns all formula logic** (brainstorm #511 decision #2): one code path — `POST /api/formulas/evaluate/` for both preview and registration. Rejected: every keystroke preview pays a round-trip (or needs prefetch/cache machinery), and the frontend can never compute instantly even for trivial arithmetic, which kills the feel of live tables.
- **Frontend owns evaluation, store-as-sent, backend never recomputes** (the deleted ADR-0010 amendment, and the interim `ResultTableNode` behavior): rejected for stored values — the LIMS would persist numbers no server ever verified, a weak CFR Part 11 position, and mod-contributed functions would need dual implementations with nothing enforcing equivalence.
- **Chosen: split by form.** Cell Formulas are ephemeral, document-local, and never stored as formulas — frontend ownership is free there. Computed Fields extend the data model and feed the Entities Hub — stored values must be backend-computed. The dual implementations this requires are bounded by parity fixture tests run in both suites.

## Consequences

- Registered Computed Field values are always backend-computed and stored with the expression version that produced them; editing an expression never silently rewrites existing entities (stale indicator + explicit recompute).
- The evaluate gateway exists but is preview-only infrastructure (row Refresh for expressions containing backend-only functions); it never produces stored values.
- Metrics are decoupled from the formula catalog entirely — they remain SQL aggregates; the "SQL-mappable capability flag" idea is dead.
- Cell Formulas are the design's one trust delegation to the client, bounded by fixture-verified platform/mod implementations and the formula text remaining visible in the source document.
