# ADR-0013: Shell-Hosted Settings Layout Kit — Composition Primitives for Coherent Settings Pages

> Date: 2026-08-03
> Status: Accepted
> Companion spec: [Spec: Settings layout kit, schema reference columns, and relationship map](https://github.com/TimHoogervorst/Helix/issues/389)

---

## Context

Settings pages in Helix are inconsistent. Every mod's settings section invents its own layout: LIMS schema-settings has a bespoke master-detail UI with legacy CSS classes, Tags is a flat Tailwind page, and Protocols/Dropdowns/Users each do their own thing. The Settings hub (`/settings`) imposes zero layout constraints on registered sections, so visual coherence is impossible and each new settings page re-solves the same layout problems.

A prototype for a standardized schema-settings page exists at `docs/prototypes/helix-eln-settings.html` and has been approved as the design source (with documented omissions). The question is where the reusable layout code should live and what shape it should take.

Three approaches were considered:

| Approach | Host | Shape | Mod author burden |
|---|---|---|---|
| **Shell-hosted composition primitives** (chosen) | Shell `src/shell/` | Set of compose-able React primitives | Compose primitives into a page |
| **Settings-mod-hosted scaffold** (rejected) | Settings mod | Config-driven scaffold | Fill in config keys |
| **Status quo — no kit** (rejected) | N/A | Each page invents its own layout | Full layout responsibility |

---

## Decision

**A reusable settings layout kit lives in the Shell, exposed as composition primitives. Every settings page gets the prototype's visual language (hero header, section cards, master list, segmented view toggle) for free by composing primitives rather than filling in a config.**

### What the kit provides (five primitives)

| Primitive | Purpose |
|---|---|
| **PageLayout** | Full-page settings layout with consistent padding, max-width, and background |
| **HeroHeader** | Page-top introduction: mono eyebrow, serif title, description, actions slot |
| **SectionCard** | Grouped content card with title/subtitle/actions header |
| **MasterList** | Filterable, selectable row list with search and archived toggle |
| **ViewToggle** | Segmented view toggle styled like the existing hub view toggles |

### Where the kit lives

The kit lives in the Shell (`src/shell/`) and is exported through the Shell's public surface — the only module every mod already depends on. This avoids cross-mod imports (e.g. hosting the kit in the Settings mod and having other mods import from it).

### What does not change

- `SettingsSectionConfig` (`id`, `modId`, `label`, `icon`, `component`, `order`) is untouched.
- The settings shell and sidebar rendering stay exactly as-is.
- The settings registration API requires no changes for a mod to adopt the kit.

### Pages own their headers

Pages own their headers via the `HeroHeader` primitive. There is no central title registry — each page composes `HeroHeader` where and how it needs it. This keeps the settings shell simple and gives pages full control over their header content.

### Styling approach

Styling is Tailwind-first, matching the newer code's direction. Two exceptions:
1. The view toggle reuses the existing hub view-toggle CSS classes verbatim.
2. The grid-paper hero background is a single small CSS class shared by all settings pages.

### Rollout strategy

One PR, sequenced seams: (1) kit + LIMS exemplar; (2) reference column + ERD; (3) migrate Protocols, Tags, Dropdowns, Users; (4) core dev-tools settings section; (5) glossary + ADRs. Later seams proceed only after the kit is approved in-review against the LIMS exemplar.

---

## Rationale

### Why composition primitives, not a config-driven scaffold

A config-driven scaffold creates a hidden DSL: every settings page looks identical because it fills in the same config shape, and any deviation requires escaping the scaffold. Composition primitives let pages compose layout elements freely — the LIMS exemplar uses master-detail; Protocols uses a flat card layout. Both use the same primitives but compose them differently. A master-detail scaffold may be extracted later only if a third page needs it.

### Why the Shell, not the Settings mod

The Settings mod would require cross-mod imports — every other mod importing layout components from the Settings mod. This creates a dependency inversion: a feature mod depending on a peer mod. The Shell is the only module every mod already depends on, so hosting the kit there keeps the dependency graph clean.

### Why Tailwind-first

The newer code in the repo (ELN workspace, sidebar, hub toggles) already uses Tailwind. Legacy CSS classes from the current schema-settings page will be retired as part of the migration. Continuing the Tailwind direction keeps the codebase coherent rather than introducing a third styling approach.

### Why the prototype's omissions

The prototype's breadcrumbs, tip card, stat cards, registry-table preview, and Duplicate/Delete buttons are deliberately omitted. Breadcrumbs and tip cards are transient help mechanisms not needed in the initial kit. Stat cards and registry-table preview require Metrics infrastructure (deferred). Duplicate/Delete are test utilities that move to the core mod's dev-tools settings section.

---

## Consequences

### Benefits

- **Consistent settings UX.** Every settings page gets the same header, cards, and controls. Users transfer what they learn across pages.
- **Reduced duplication.** New settings pages compose primitives instead of rebuilding layout. No bespoke CSS per page.
- **Clean dependency graph.** Kit lives in the Shell, where every mod already depends. No peer-mod imports.
- **Flexible composition.** Pages are not locked into a single scaffold shape. Master-detail, flat-card, and future layouts use the same primitives.
- **No registration API changes.** Mod authors adopt the kit without changing how they register settings sections.

### Constraints

- **Shell grows slightly.** The Shell gains a `settings-layout/` directory with five primitives. This is justified by consolidation: five primitives in the Shell replace N bespoke layouts in N mods.
- **LIMS schema-settings migrates first.** The existing bespoke layout is replaced by the kit composition. This is the riskiest seam — the kit must prove itself against the most complex settings page.
- **Legacy CSS retired.** The current schema-settings CSS classes are removed, not left dormant. Any code referencing those classes must be updated.
- **Prototype is the design source.** The kit's visual language is defined by `docs/prototypes/helix-eln-settings.html`, not by individual judgment. Human review validates pixel fidelity.

### Future considerations

- **Master-detail scaffold.** If a third settings page needs master-detail, the LIMS exemplar's composition can be extracted into a `MasterDetailSettings` scaffold in the kit.
- **Non-settings kit adoption.** The primitives (hero header, section cards) could migrate to non-settings pages (e.g. user profile) if the visual language proves useful outside `/settings`.
- **Additional primitives.** A `Table` primitive (sortable, filterable data table) or a `FormField` primitive may be added if new settings pages need them consistently.
