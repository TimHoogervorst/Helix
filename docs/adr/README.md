# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for OpenScience.

ADRs capture significant architectural decisions, the context in which they were made,
the alternatives considered, and the consequences. They serve as a historical record
and onboarding reference for contributors.

## Index

| # | Title | Date | Status |
|---|-------|------|--------|
| [0001](0001-tiptap-json-content-format.md) | TipTap JSON for ELN Entry Content | 2026-06-24 | Accepted |
| [0002](0002-display-id-prefix-routing.md) | Display ID System with Prefix-Based Routing | 2026-06-25 | Accepted |
| [0003](0003-library-filesystem-browsing.md) | Library as Unified Filesystem-Like Console | 2026-06-26 | Accepted |
| [0004](0004-unified-console-pattern.md) | Unified Console Pattern for LIMS and Library | 2026-06-27 | ~~Accepted~~ Deprecated (Console→Hub, #140) |
| [0005](0005-entry-status-cascade.md) | Entry Status Cascades to Source Entities | 2026-07-02 | Accepted |
| [0006](0006-workspace-entity-type-registry.md) | Workspace-Based Mention Resolution via Entity Type Registry | 2026-07-09 | Accepted |
| [0007](0007-monorepo-restructure.md) | Monorepo Restructure — co-located mods, single manifest | 2026-07-16 | Accepted |

## Creating a New ADR

1. Copy an existing ADR as a template.
2. Number sequentially (`0003-<slug>.md`).
3. Fill in Context, Decision, Rationale, Consequences, and Rejected Alternatives sections.
4. Set Status to `Proposed` and open a PR for review.
5. Once accepted, update Status to `Accepted` and merge.

## Statuses

- **Proposed** — under discussion
- **Accepted** — approved and implemented (or planned for implementation)
- **Deprecated** — superseded by a later ADR
- **Rejected** — declined after discussion (kept for historical reference)
