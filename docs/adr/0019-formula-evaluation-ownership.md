# ADR-0019: Formula Evaluation Ownership — Backend-Authoritative Computed Fields

> Date: 2026-08-19
> Status: Accepted
> Origin: grilling session on [Brainstorm: Formula support #511](https://github.com/TimHoogervorst/Helix/issues/511); spec at [docs/specs/formula-support-cell-formulas-and-computed-fields.md](../specs/formula-support-cell-formulas-and-computed-fields.md)

**Computed Fields** are schema-authored columns and backend-authoritative: the backend validates expressions and computes stored values at registration, while optional client implementations provide display-only previews. Every formula function is defined once in the backend catalog with one authoritative backend implementation and at most one optional client implementation; frontend-only functions do not exist.

## Considered Options

- **Backend owns all formula logic** (brainstorm #511 decision #2): backend validation and registration are authoritative, with the evaluate gateway providing preview values for expressions that need server-only functions.
- **Frontend owns evaluation and the backend never recomputes**: rejected for stored values because the LIMS would persist numbers no server verified.
- **Chosen: backend-authoritative Computed Fields.** Computed Fields extend the data model and feed the Entities Hub; stored values must be backend-computed. Optional client implementations are bounded to display previews and parity tests.

## Consequences

- Registered Computed Field values are always backend-computed and stored with the expression version that produced them; editing an expression never silently rewrites existing entities (stale indicator + explicit recompute).
- The evaluate gateway exists but is preview-only infrastructure (row Refresh for expressions containing backend-only functions); it never produces stored values.
- Metrics are decoupled from the formula catalog entirely — they remain SQL aggregates; the "SQL-mappable capability flag" idea is dead.
