# ADR-0016: Design-System Foundation — Theme Seeds, Derived Shades, and the Label/Body Type System

> Date: 2026-08-06
> Status: Proposed
> Companion spec: [Spec: Design-system foundation — theme tokens, font roles, UI primitives](https://github.com/TimHoogervorst/Helix/issues/415)

---

## Context

The UI grew organically and inconsistently: 228 buttons (137 styled one-off, plus phantom `.btn-primary`/`.input` classes that were used but never defined), four independent table implementations, six collapsible patterns, a legacy `--gray-*`/`--blue-*` palette used ~240× alongside the semantic tokens, hardcoded hover shades, and a `--font-serif` token naming Fraunces — a font that was never shipped, so every display title silently rendered in Georgia.

Two forces made this urgent: every new component re-solved the same styling problems, and the planned **Preferences module** (user-customizable colours) is impossible while colours are hardcoded. The question was what the design system's architecture should be — and how much of it Preferences should be able to swap.

Three approaches were considered for the colour layer:

| Approach | Shape | Consequence |
|---|---|---|
| **Seed + derivation** (chosen) | Five seed tokens; all states derived via `color-mix()` in OKLCH | User-pickable schemes for free; one source of truth |
| Hand-picked per-state tokens (rejected) | Every state shade stored independently | N×M tokens per theme; impossible for user-defined colours |
| Full theme presets only (rejected) | Platform ships fixed light/dark/custom themes | No user-defined schemes without later rework |

For type, the choice was between shipping the intended serif (Fraunces), keeping an accidental system-serif fallback, or deleting the serif role entirely.

---

## Decision

**The visual theme is defined by five Theme Seeds; every other colour is a Derived Shade computed from them. Text uses exactly two Font Roles — Label and Body. A throwaway prototype gallery is the design source; migration proceeds seam by seam behind it.**

### Five Theme Seeds

`Background` (app canvas), `Surface` (raised panels/cards), `Ink` (text; source of borders, hairlines, muted text), `Primary` (action colour), `Accent` (highlight/selection). Semantic colours (destructive/success/warning) are platform-fixed — they carry meaning and are never user-customizable. Domain colours (tags, schemas, metric cards) remain *Color Tokens* and are untouched by the theme system entirely. Surface is an explicit seed — not derived from Background — so dark schemes later require no re-derivation rules.

### Derived Shade ladder

State shades are computed with `color-mix()` in OKLCH space: per seed — `hover`, `active`, `subtle`, `foreground`. From Ink — `border`, `hairline`, `muted-foreground`. Focus indication (Accent ring) and disabled state (reduced opacity) are *rules*, not tokens. Hardcoding a shade that could be derived is a defect.

### Two Font Roles

**Label** (`--font-label`, JetBrains Mono) is the voice of the interface: headers, tabs, eyebrows, display IDs, data cells, badges, and page/UI titles. **Body** (`--font-body`, Inter) is the voice of content: names of things, editor narrative, button labels, prose. The serif role is deleted: `--font-serif` is removed and its ~25 usages reassigned by the split rule (page/UI titles → Label; content names → Body). Fraunces never ships.

### Scale, text styles, primitives

Ten-step typographic scale (`--text-2xs` 10px … `--text-4xl` 42px; `--text-base` = 13px, deliberately not the 16px framework default). Four composite text styles (`.text-eyebrow`, `.text-title`, `.text-meta`, `.text-data`). Shell-hosted composition primitives per the ADR-0013 philosophy: Button, IconButton, Input/Textarea/Select, Collapsible, Table family (presentational, composable — not a data-table component), TabBar, Modal, Menu, Badge.

### Process: prototype-first, seam migration

A throwaway `/prototype` route (hidden from nav) showcases every primitive × variant × state, includes title examples, and carries a seed-switcher that live-swaps the five seeds. It is the design source and the alignment surface — no migration starts until it is approved. Slight CSS duplication with `styles.css` is tolerated while it lives; the page is deleted before the PR merges. Migration follows the seam map in the spec (#416–#424).

### What this PR is not

This PR ships `applyThemeSeeds({ background, surface, ink, primary, accent })` and nothing more. Theme-JSON storage on the User record and boot-time application are the **next PR** — the Preferences module itself.

---

## Rationale

### Why seeds + derivation

User-picked colours are the stated goal of Preferences. Any architecture with hand-picked state shades forces every future scheme to define N×M tokens — impossible for arbitrary user colours. With `color-mix()` derivation, a scheme is exactly five values; the entire state ladder follows. The derivation percentages are tuned once, in the token layer, against the prototype.

### Why delete the serif

The serif role was already fictional — Fraunces was declared but never loaded, so titles rendered in a system fallback no one chose. Restoring it meant shipping a third variable font for a handful of titles; deleting it makes the two-font system (mono chrome, sans content) coherent, self-hosting-complete, and gives the platform a distinctive lab-console voice. The accidental Georgia rendering disappears by deletion.

### Why Label and Body as role names

The rule is "pick a role, never a raw font-family," so the names must be roles. "Display" was rejected (it conventionally means large titles, which are often Body here); "Chrome" was rejected by the maintainer. Every Label-family usage — headers, tabs, eyebrows, IDs, badges — is genuinely a *label*; every Body-family usage is content.

### Why a throwaway prototype, not a permanent gallery

The prototype exists to align on tokens, primitives, and the Label/Body split against live examples — the same pattern ADR-0013 used with its approved HTML prototype. A permanent gallery is a maintenance surface with no consumer after migration; the real components, exercised by real pages and tests, become the living documentation. The prototype's seed-switcher doubles as the proof-of-concept for Preferences.

### Why storage is deferred

A half-wired persistence layer in this PR would be re-done by the Preferences PR. The building block is the token architecture plus `applyThemeSeeds()`; once colours derive from five seeds, storage becomes a trivial JSON read at boot.

---

## Consequences

### Benefits

- **One source of truth.** Seeds + ladder end the parallel legacy palette, hardcoded hovers, and phantom classes.
- **Preferences becomes cheap.** User colour schemes are five values; the apply mechanism already exists.
- **Consistent UI by construction.** Primitives + Font Roles + text styles make the off-standard choice the explicit, visible one.
- **Reviewable migration.** Prototype approval gates nine small seams instead of one mega-diff.

### Constraints

- **`--text-base` = 13px** deviates from Tailwind muscle memory (16px); the glossary documents this deliberately.
- **Serif titles disappear** across ~25 sites — settings heroes become Label-role. This is a deliberate identity change, approved via the prototype's title examples.
- **`color-mix()` reliance** — Baseline-widely-available since 2023; no fallback is provided for ancient browsers.
- **Prototype is deleted** — alignment knowledge lives in the spec issue trail, not in a kept artifact.

### Future considerations

- **Preferences PR**: theme JSON on the User record (five seeds), boot-time `applyThemeSeeds()`, and the Preferences UI replacing the disabled placeholder in `UserMenu.tsx`. Dark schemes are nearly free (Surface is already an explicit seed).
- **Density/typography preferences** remain possible later but are out of the current plan.
- **CellEditors** (table-cell editing) and TipTap-internal styling are deliberately excluded from the primitive set; revisit if a third consumer appears.
