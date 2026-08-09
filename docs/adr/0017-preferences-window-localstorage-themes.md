# ADR-0017: Preferences Window — Themes as Seed Bundles, Persisted in localStorage

> Date: 2026-08-06
> Status: Superseded by [ADR-0018](0018-design-system-and-preferences.md)
> Supersedes: the persistence assumption in [ADR-0016](0016-design-system-foundation.md) ("theme JSON on the User record")

---

## Context

ADR-0016 deferred two things to "the next PR": theme persistence — which it assumed would be theme JSON on the User record — and boot-time application. Designing the Preferences Window surfaced a simpler answer: Preferences are per-user, cosmetic, and per-device by nature, and the platform already persists comparable choices (library/entities view modes) in localStorage under `helix-*` keys.

---

## Decision

**Preferences live in localStorage — permanently, never on the User record.**

- The **Preferences Window** is a Modal opened from the user menu (replacing the disabled placeholder), built on the shared `Modal` primitive, with a small internal nav: **Themes** and **Customize**.
- A **Theme** is exactly the five Theme Seeds plus metadata (`id`, `name`, `description`) — never derived shades (ADR-0016). Built-in Themes ship as JSON files in a folder, loaded via `import.meta.glob`, so an external mod can later contribute themes through the same seam. Nine ship: Original, Cyberpunk, Forest, Terminal, Lavender, GPT, Claude, Benchling, eLabFTW. Original is the default.
- The **Themes** tab applies and persists on click. The **Customize** tab edits the five seeds live as a draft; "Save as theme" stores a Custom Theme in localStorage; Reset restores the Active Theme's seeds. Semantic colours (destructive/success/warning) stay platform-fixed.
- A `ThemeProvider` in the shell applies the Active Theme at boot via `applyThemeSeeds()`. A one-frame flash of the default theme on hard load is accepted; no blocking inline script.
- Storage: `helix-active-theme` (theme id) and `helix-custom-themes` (user-saved themes). Deleting the Active Theme falls back to Original.

---

## Rationale

### Why localStorage, not the User record

Preferences answer "how does the platform look *to me, on this device*." Server storage would add a migration, API surface, and cross-device sync semantics for a purely cosmetic choice — and would make themes follow the account across machines, which is not the intent. localStorage matches the existing `helix-*` precedent and costs zero backend work.

### Why a JSON folder rather than TS modules

JSON data files keep themes declarative and leave a clean seam for external mods to contribute themes later without importing application code; a small runtime guard skips malformed files instead of crashing the theme layer.

---

## Consequences

- Themes do **not** sync across browsers or devices — deliberate. Revisit only if roaming preferences become a real request.
- No backend changes; the `UserMenu` placeholder becomes a live button.
- ADR-0016's "Future considerations" persistence sentence is superseded; boot-time application lands here as planned.
