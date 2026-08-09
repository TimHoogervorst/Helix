# ADR-0018: Design System and Preferences — Seeds, Derived Overrides, Fonts, and localStorage

> Date: 2026-08-09
> Status: Proposed
> Supersedes: [ADR-0016](0016-design-system-foundation.md), [ADR-0017](0017-preferences-window-localstorage-themes.md)

---

## Context

The UI grew organically with inconsistent styling — 228 buttons, multiple table implementations, a legacy `--gray-*`/`--blue-*` palette, and hardcoded hover shades. Two forces made a design system urgent: every new component re-solved the same styling problems, and the planned Preferences module (user-customizable colours) was impossible while colours were hardcoded.

ADR-0016 introduced the seed+derivation architecture (five seeds, all state shades derived via CSS `color-mix()`). ADR-0017 added localStorage persistence and the Preferences window. After shipping both, two extensions were needed: (1) users want to override individual derived colours (a different border shade, a tweaked hover) without losing the auto-derivation for everything else, and (2) users want per-theme font choices so themes like Terminal and Cyberpunk can carry distinct typographic identities.

---

## Decision

**The visual theme is defined by five Theme Seeds, an optional set of Derived Overrides (with stale detection), and two Font Roles — all persisted in localStorage.**

### Five Theme Seeds

`Background` (app canvas), `Surface` (raised panels/cards), `Ink` (text; source of borders, hairlines, muted text), `Primary` (action colour), `Accent` (highlight/selection). Semantic colours (destructive/success/warning) are platform-fixed. Domain colours (tags, schemas, metric cards) remain Color Tokens and are untouched by the theme system.

### Derived Shade Ladder

State shades are computed with `color-mix()` in OKLCH space:

| Seed | Derived Suffixes |
|---|---|
| Background | `-hover`, `-active`, `-subtle`, `-foreground` |
| Surface | `-hover`, `-active`, `-subtle`, `-foreground` |
| Ink | `-hover`, `-active`, `-subtle`, `-foreground`, `-border`, `-hairline`, `-muted-foreground` |
| Primary | `-hover`, `-active`, `-subtle`, `-foreground` |
| Accent | `-hover`, `-active`, `-subtle`, `-foreground` |

**23 derived shades total.** Focus indication (accent ring) and disabled state (reduced opacity) are rules, not tokens.

### Derived Overrides

Any of the 23 derived shades can be overridden per theme. When a user explicitly sets a derived colour, the theme stores a pair:

```json
{ "expected": "#e5e5e5", "value": "#ff0000" }
```

- `expected` — the auto-derived colour at the time the override was set
- `value` — the user's chosen colour

Only overridden keys are persisted; absent keys fall through to CSS derivation.

**Adjusted detection.** When seeds change, the system recomputes auto-derived values (via DOM `getComputedStyle` snapshot) and compares against stored `expected`. If they differ, the override has "adjusted" — the underlying derivation shifted but the user's custom value still holds. A subtle refresh icon (↻) appears next to the affected row in the Customize tab; clicking it resets to the new auto-derived value.

### Two Font Roles

**Label** (`--font-label`) is the voice of the interface: headers, tabs, eyebrows, display IDs, data cells, badges, page/UI titles. **Body** (`--font-body`) is the voice of content: names, editor narrative, button labels, prose.

Fonts are stored per theme as raw `font-family` CSS strings. If absent, the theme falls back to the global defaults (JetBrains Mono for Label, Inter for Body).

A curated dropdown offers 8 presets:

| Preset | font-family |
|---|---|
| JetBrains Mono | `"JetBrains Mono Variable", "JetBrains Mono", "SF Mono", "Cascadia Code", Consolas, monospace` |
| Inter | `"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` |
| Fira Code | `"Fira Code Variable", "Fira Code", "SF Mono", Consolas, monospace` |
| Cascadia Code | `"Cascadia Code", "SF Mono", Consolas, monospace` |
| SF Mono | `"SF Mono", Consolas, monospace` |
| Courier New | `"Courier New", Courier, monospace` |
| System Sans | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` |
| System Mono | `"SF Mono", Consolas, "Courier New", monospace` |

A "Custom…" option reveals a free-text input for any installed font family.

### Per-Theme Font Defaults

| Theme | Label | Body |
|---|---|---|
| Original | JetBrains Mono | Inter |
| Benchling | JetBrains Mono | Inter |
| eLabFTW | System Mono | System Sans |
| Claude | JetBrains Mono | Inter |
| GPT | JetBrains Mono | Inter |
| Cyberpunk | Fira Code | Inter |
| Forest | JetBrains Mono | Inter |
| Terminal | Courier New | Courier New |
| Lavender | JetBrains Mono | Inter |

### Theme Schema (unified)

```ts
interface Theme {
  id: string;
  name: string;
  description: string;
  seeds: ThemeSeeds;                                            // 5 base colours
  derived?: Record<string, { expected: string; value: string }>; // optional overrides
  fonts?: { label: string; body: string };                     // raw font-family strings
}
```

Custom themes (user-saved) have `description: ""`. No separate `CustomTheme` type — one schema for built-in and user themes.

### `applyTheme()` — unified application

A single function replaces the old `applyThemeSeeds()`:

1. Set the 5 seed CSS custom properties on `:root`
2. Set `--font-label` and `--font-body` (from `theme.fonts`, or CSS defaults)
3. Wait one frame (requestAnimationFrame) for CSS `color-mix()` cascade
4. Snapshot `getComputedStyle` for all 23 derived keys → auto-derived values
5. For each key in `theme.derived`: compare `stored.expected` against auto-derived snapshot → track adjusted state; set `override.value` on `:root`
6. Keys not in `theme.derived` are left to pure CSS derivation

### Typographic Scale, Text Styles, Primitives

Ten-step typographic scale (`--text-2xs` 10px through `--text-4xl` 42px; `--text-base` = 13px). Four composite text styles (`.text-eyebrow`, `.text-title`, `.text-meta`, `.text-data`). Shell-hosted composition primitives: Button, IconButton, Input/Textarea/Select, Collapsible, Table, TabBar, Modal, Menu, Badge.

### localStorage Persistence

- `helix-active-theme` — active theme ID
- `helix-custom-themes` — array of user-saved `Theme` objects

Built-in themes ship as JSON files loaded via `import.meta.glob`. A `ThemeProvider` in the shell applies the active theme at boot via `applyTheme()`. Deleting the active custom theme falls back to Original. A one-frame flash of the default theme on hard load is accepted.

### Preferences Window

A Modal with three tabs: **Themes** (theme grid with colour swatches, "Active" badge, delete for customs), **Customize** (fonts at top, then seeds, then 23 derived shades grouped by seed — each row shows label, auto-derived swatch, optional override picker, ↻ if adjusted, Reset and Save-as-theme buttons at bottom), accessible from the user menu.

---

## Rationale

### Why derived overrides with expected/value pairs

User-picked colours are the stated goal. Keeping the five-seed auto-derivation as the default preserves the design system's "one source of truth." Adding per-key overrides lets power users tune individual shades without hand-specifying all 23. The `expected`/`value` pair enables stale detection without a JS colour library — the DOM snapshot comparison is zero-dependency and guaranteed to match the rendering.

### Why DOM-based stale detection, not a JS library

`color-mix(in oklch, var(--color-ink) 10%, var(--color-background))` depends on CSS custom properties and the browser's colour engine. Replicating this in JS would require pulling in a library like culori and keeping its OKLCH mixing behaviour in lockstep with the browser. Reading `getComputedStyle` after seeds are applied costs one frame and is always correct.

### Why fonts per theme, raw strings

Per-theme fonts give themes like Terminal and Cyberpunk distinct typographic identities (e.g., Courier New for a CRT feel, Fira Code for a neon-lab aesthetic). Storing raw `font-family` strings keeps themes self-contained — no dependency on a lookup table. The curated dropdown is a convenience for the editor, not a runtime requirement.

### Why combine 0016 and 0017

The seed architecture, derivation, overrides, font roles, localStorage persistence, and the preferences window are a single coherent system. Split ADRs created artificial seams — 0017's schema and 0016's derivation ladder are now a unified `Theme` type in a single ADR.

### Why localStorage, not the User record

Preferences are per-user, cosmetic, and per-device by nature. Server storage would add a migration, API surface, and cross-device sync semantics for a purely cosmetic choice. localStorage matches the existing `helix-*` precedent and costs zero backend work.

---

## Consequences

### Benefits

- **One source of truth with escape hatches.** Seeds + ladder handle 95% of themes; overrides let the last 5% tune specific shades.
- **Theme portability.** A `Theme` JSON object is complete — seeds, overrides, fonts — and can be shared or exported.
- **Consistent UI by construction.** Primitives + font roles + text styles make the off-standard choice the explicit one.
- **No backend work.** localStorage persistence, zero API surface.

### Constraints

- **`--text-base` = 13px** deviates from Tailwind muscle memory.
- **`color-mix()` reliance** — baseline-widely-available since 2023; no fallback for ancient browsers.
- **Themes do not sync across devices** — deliberate. Revisit only if roaming preferences become a real request.
- **One-frame flash** on hard load as the theme is applied via JS, not a blocking inline script.

### Migration from old ADRs

- ADR-0016's seed+derivation architecture carries forward unchanged; the override mechanism is a strict extension.
- ADR-0017's localStorage keys (`helix-active-theme`, `helix-custom-themes`) are unchanged. Existing custom themes without `derived` or `fonts` fields are valid — absent keys fall through to defaults.
