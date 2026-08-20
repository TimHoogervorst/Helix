# ADR-0021: Formula Parity Seam — Catalog as Source of Truth

> Date: 2026-08-20
> Status: Accepted
> Origin: grilling session on [issue #532](https://github.com/TimHoogervorst/Helix/issues/532) (architecture review 2026-08-20); extends [ADR-0019](0019-formula-evaluation-ownership.md) without merging the two engines

The two formula engines are deliberate (ADR-0019), but their only guard was a hand-written fixture with no coverage guarantee, and "backend-only function" knowledge was duplicated as regex scans in both table blocks — which had already drifted apart (one regex misses namespaced functions). The backend **Function Catalog becomes the seam's source of truth**: every function declares at registration whether it has a Client Implementation, the parity corpus is hand-authored but coverage-enforced from the catalog, and "which functions in this expression lack a client implementation" is a first-class engine query instead of expression-text scanning.

## Considered Options

- **Generate the parity suite from the backend** (management command / CI freshness snapshot): rejected. Expected values cannot be generated — snapshotting the backend's own answers would launder a backend bug into the spec. The fixtures are the specification. A coverage test walking the catalog ("every catalogued function appears in at least one fixture") buys the guarantee the issue wanted without generating any values.
- **Derive `hasClientImplementation` at client boot only** (status quo intersection): rejected as the source. True at runtime but invisible to the backend test tree and to future catalog UI (Formula Editor badges). Mods are co-located — the author writes both sides, so declaring at backend registration is truthful and auditable; client hydration *verifies* the declaration (degrade + warn on mismatch, never fatal).
- **Move the corpus into the backend tree or a neutral directory**: rejected. Both consumers already work against `src/shell/src/shared/formulas/parity.json`; the file's authority comes from the coverage test, not its folder.
- **A distinct error code for known-but-unimplemented functions**: rejected. Error codes stay identical across engines; `#NAME?` remains reserved for names absent from the catalog entirely. Backend-only-ness is answered by the query, not by evaluation.

## Consequences

- Adding a Formula Function requires: backend implementation, catalog registration with the Client Implementation declaration, and at least one parity fixture — the coverage test enforces the last one. Backend-only fixtures carry `backendOnly: true`; the backend asserts the value, the frontend asserts `#NAME?` and that the unimplemented-functions query names the function.
- "Backend-only" detection is one shared, parse-based helper in the formulas module; both table blocks consume it. The duplicated regexes are deleted.
- The client `%` operator must match Python modulo semantics (divisor sign) — found live during the grilling session (`−7 % 3` diverged); the backend is authoritative, so the client was wrong.
- The Evaluate Gateway is single-expression (one expression + one row per call; Refresh loops in dependency order) — the glossary previously described a batch shape the code never had and has been corrected.
- The Computed Fields module candidate consumes the declaration and the shared query from day one; this seam lands first, independently.
