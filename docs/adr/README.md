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
