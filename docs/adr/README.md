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
| [0008](0008-single-source-registration.md) | Single Source Registration — backend as the authoritative source | 2026-07-24 | Accepted |
| [0009](0009-actions-api-gateway.md) | Actions API Gateway — unified endpoint for all database mutations | 2026-07-24 | Accepted |
| [0010](0010-column-type-registry.md) | Column Type Registry — backend-owned typed column definitions | 2026-07-24 | Accepted |
| [0011](0011-declarative-bus-subscriptions.md) | Declarative Bus Subscriptions — `listensTo`/`onEvent` as canonical block API | 2026-07-30 | Accepted |
| [0012](0012-tiptap-renderer-editor-host.md) | TipTapRenderer as Sole Editor Host — dissolving the host-component anti-pattern | 2026-07-30 | Accepted |
| 0013 | Shell-Hosted Settings Layout Kit — composition primitives for coherent settings pages | 2026-08-03 | Accepted |
| 0014 | Reference Columns Target a Schema — mirroring the dropdown precedent | 2026-08-03 | Accepted |
| [0015](0015-icon-color-library-ownership.md) | Icon and Color Library Ownership Split | 2026-08-04 | Accepted |
| [0016](0016-design-system-foundation.md) | Design-System Foundation — Theme Seeds, Derived Shades, and the Label/Body Type System | 2026-08-06 | Proposed |

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
