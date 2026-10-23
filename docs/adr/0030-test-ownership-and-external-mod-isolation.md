# ADR-0030: Test Ownership and External Mod Isolation

> Date: 2026-10-14
> Status: Accepted; implementation complete
> Related: [ADR-0027](0027-repository-tiers-and-golden-rule.md), [ADR-0029](0029-closed-bundled-open-external-discovery.md)

Helix's test suite owns Platform behavior (including the Shell and public Mod API) and Bundled Mod behavior. Bundled Mods keep their dedicated tests inside their own folders. External Mods own their tests independently, even while their source temporarily resides in this repository. Helix CI will exclude External Mod tests; it will not provide an ELN-specific job, including for changes inside ELN. ELN's future repository will own its runner and GitHub Actions.

Platform and Bundled Mod tests must prove their contracts without depending on ELN or another real External Mod. Where tests currently borrow ELN as an example package, resource, or action, replace that dependency with minimal Platform-owned fake Mod contributions. Keep actual loading, registration, database, and authorization behavior real where those are the contracts under test.

Completion requires the Helix suite to work with real External Mod packages absent, not merely with their test files excluded. This applies to backend and frontend setup and dependencies as well as test discovery. External integration scenarios use the Platform-owned fake Mod.

The real `src/mods/hello_world` example is not the Platform test fixture. Replace Platform tests' dependency on that example with a dedicated fixture inside the Platform test tree. Example-specific checks belong alongside hello-world and follow External Mod suite ownership.

Assign individual scenarios by the behavior they protect. Generic actions, authorization, ownership, mentions, and discovery checks remain with the Platform or owning Bundled Mod; genuinely ELN-specific scenarios belong inside ELN. A mixed test file is not a reason to move all its checks to ELN or exclude the whole file.

The cleanup reviews existing scenarios individually: keep useful checks, rewrite weak or coupled checks, move checks to their owner, and remove obsolete or redundant checks. Preserve meaningful behavioral guarantees rather than optimizing test counts. Restore excluded Platform and access checks before broader assertion and fixture cleanup.

Exhaustive edge-case matrices belong with the code that owns the rule. Callers retain focused integration checks proving that they invoke the rule correctly and preserve their own contracts, including authorization enforcement, persistence, error mapping, and partial-success behavior where applicable. Similar tests at different layers are not redundant when they protect different failure paths.

Remove checks for retired UI elements and superseded implementation details unless they protect an explicit ongoing requirement. Preserve intentional absence guarantees such as hiding unauthorized controls. Prefer current-behavior assertions over historical migration checks, and require retained assertions to distinguish the intended behavior or failure from unrelated outcomes.

Preparing ELN's standalone runner, fixtures, or CI is outside this work. Moving ELN-owned scenarios into its folder is in scope. This decision does not promise that Helix changes are compatible with every External Mod implementation: Helix protects its generic public contracts, and External Mods own their integration suites.

Small production changes are in scope when required to remove Platform or Bundled Mod dependencies on ELN exposed by this cleanup. Larger feature redesigns become explicit follow-up work; this is not a general ELN extraction project. A remaining dependency that prevents the independent suite from working is an unresolved completion blocker, not something to hide by excluding its tests.
