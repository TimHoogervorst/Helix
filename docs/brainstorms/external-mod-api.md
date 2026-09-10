# Brainstorm: External Mod API — Reasoning Record

> Status: COMPLETE. The actionable content lives in the epics: #609 (Phase 1: Repo Restructure) → #610 (Phase 2a: External Mod Loading + Contract Freeze) → #611 (Phase 2b: Discovery System) → #612 (Phase 3: ELN external). Decisions and grilling agendas are in the tickets; this doc retains the cross-phase assessments and the *reasoning* behind the decisions. Long-term context: #580 (infrastructure abstraction), #608 (data portability).

## Structural assessment

**What already existed in our favor (2026-09):**

- `Mod` (frontend) and `BackendModRegistry` (backend) are real registration APIs all internal mods use — the "external API = internal API" principle was already half-true.
- Manifest with `vendor.name` identity, `dependsOn`, topological sort, duplicate/cycle validation on both sides.
- An experimental backend external loader (`helix.mods.json` → `mod_system/loader.py`).
- Independent per-mod Django migrations; service-mediated cross-mod calls.

**Readiness for a first external mod:** backend ~80% (missing: pip-installable packages, identity normalization, `requiresHelix`), frontend ~0% (Vite glob welded to monorepo layout, no shared-dependency story), agent materials ~30% (docs exist, types not importable from outside — an external author could only *copy an internal mod*).

**Conclusion:** the *conceptual* structure was enough; the *physical* structure was not. Two structural blockers: monorepo-welded frontend discovery, and core carrying ELN/LIMS knowledge (`abstracts.py` hardcoding, ELN's direct `mods.lims` imports). Everything else was protocol/doc work.

## Why lean-now / robust-later is safe

- **Deferrable = tooling.** Entry-point discovery, Vite SDK plugin, CLI, published SDK packages, compat-matrix CI (the far-future "Dual-Artifact Mod Kit") are plumbing; replaceable. The one structural rule keeping that future reachable: build external loading as a **generalization of the existing mechanism**, never a **parallel mechanism** for outsiders.
- **Not deferrable = the contract.** The freeze is triggered by *the first external mod existing at all*, not by choosing the robust option. The moment hello-world lives outside the repo, registration surface, manifest schema, identity scheme, and the public/private line are frozen. Phase 2a therefore designs the contract as if the full SDK started tomorrow.
- **Tiering, not dismantling.** Bundled mods stay on the mod API because the external API only stays honest while first-party code suffers its papercuts. A privileged internal path would create two APIs and second-class external mods (`abstracts.py` was the fossil of that happening once).

## Why these core principles

- **Golden rule** (external may know core; core never names external): dissolves every "core reaches into ELN" problem by inversion — core publishes generically, external mods pull. Mechanically enforced by the `core/`-never-imports-`mods/` layout (#609).
- **Provider-declared capability tags** as the discovery model: the provider declares what its registrations can do; consumers match by tag and never learn identities. Persisted registry data, so it outlives the declaring mod — which makes it the seed of #608's capability registry and #580's capability advertising. Two classes: curated platform flags (`ShowInLibrary`, `CanBeSource`, `Registrable`) and open vendor-namespaced tags for mod ↔ mod matching.
- **Variant A (pull) over B (matching resolver)** for blocks ↔ slots: same registry rows, less machinery; B is just A's matching key widened later when N×M integrations exist.
- **"Mod", never "plugin"**: plugin overpromises runtime install/sandboxing we deliberately don't offer; one vocabulary across code, manifests, and docs keeps agents from reconciling two names. Tiers covered by *bundled* vs *external* mods.
- **Agent materials = types + validation loop + golden example** (installable TS/pip types, runnable `validate`, hello-world as exemplar; prose generated from types so it can't drift). No forced skill/generator — good materials get picked up naturally; we don't impose tooling on users.
- **#580/#608 prep = three cheap moves**: don't make reversible-hostile decisions; build shared primitives once in the form the epics will extend (service registry, persisted tags); adopt their invariants now while free (mods touch infra only via Helix-level APIs; provenance stamps mod id + version).
- **ELN portability debt, option (a)**: ELN moves out *before* a #608 contract layer exists. Year one has no final mods — the nuclear option (rewriting mods) is available. Guardrail: entity-level data is already portable (`AbstractEntity` + schema type); only content documents degrade. Honest v1 invariant: **structure survives, specialized rendering doesn't.**

## Why this phasing

| Phase | Epic | Why here |
|---|---|---|
| 1 | #609 Repository Restructure | Makes the tier line physical and lint-enforceable; dissolves the `server/core` grab-bag; **settles pre-freeze identity renames** — after Phase 2a, mod IDs are public forever. |
| 2a | #610 External Loading + Contract Freeze | Proves *loading* with the cheapest possible mod (hello-world) before the hardest one (ELN); freezes the contract with types + validate loop as agent materials. |
| 2b | #611 Discovery System | Proves *integration without knowing each other* (capability tags, generic consumers, metrics-as-services, degradation catch v0). Hard prerequisite for Phase 3: ELN can only leave once Library/home/registry-table consume by flags, not by name. |
| 3 | #612 ELN External | The end-to-end proof on the hardest real case; pays the extraction debt list (largest item: frontend public surface = defining the SDK by doing it once for ELN); its uninstall path proves the degradation catch. |

Ordering logic: structure → loading → integration → extraction. Each phase makes the next one's failures attributable: if ELN extraction breaks in Phase 3, the platform was already proven in 2a/2b, so the fault is ELN-specific.
