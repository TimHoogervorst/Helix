# PRD-06: LIMS Three-Panel Expandable Layout

**Status:** `ready-for-agent`
**Date:** 2026-06-26

## Problem Statement

The current LIMS entity browser (`/lims`) uses a two-panel master/detail layout: a table of entities on the left, and a detail card on the right that opens when clicking a row. This works well for quick scanning, but there is no room for deeper entity details — things like activity history, attachments, related entities, or structured properties tables. As more entity detail features are added, the single detail panel will become cramped.

The user needs a way to progressively expand from a summary view into a full-detail view, with reserved space for future detail tabs (Properties, Activity, etc.).

## Solution

Extend the two-panel layout into a **three-panel layout** with an explicit state machine. The left panel (entity table) gains the ability to collapse into a narrow toggle strip. The right side gains a new "more-detail" panel with a tab bar, where the entity's properties table lives. The middle panel becomes a compact summary card.

Users can transition between three view states:
- **List** — just the entity table (no selection)
- **Detail** — two-panel: table on left, summary card on right (current behavior, but properties moved to the more-detail panel)
- **Expanded** — three-panel: collapsed toggle strip left, summary card middle, tabbed more-detail panel right

Each row gains a `>` button that skips directly from List to Expanded, and the detail card header gains `>` / `<` buttons for transitioning between Detail and Expanded. All buttons use consistent styling with the existing close (`x`) button.

## User Stories

1. As a lab researcher browsing LIMS entities, I want to quickly scan the entity table and click a row to see a summary, so that I can verify entity metadata without leaving the list.

2. As a lab researcher, I want to click a `>` button on any table row to jump directly into the full three-panel detail view, so that I can skip the intermediate summary when I know I need the full details.

3. As a lab researcher, I want a `>` button on the summary card header when in two-panel view, so that I can expand to the full three-panel view after reviewing the summary.

4. As a lab researcher, I want a `<` button on the summary card header when in three-panel view, so that I can collapse back to the two-panel layout and browse the entity list again.

5. As a lab researcher, I want an `x` button on the summary card header in any state, so that I can close all detail panels and return to the full entity list.

6. As a lab researcher, I want the entity table to collapse into a narrow strip with a `>` button when the three-panel view is open, so that the detail panels have maximum screen space.

7. As a lab researcher, I want to click the `>` button on the collapsed strip to re-expand the entity list and collapse the more-detail panel, so that I can select a different entity.

8. As a lab researcher, I want the properties of an entity to be displayed in a tabbed panel on the right in three-panel view, so that I have room for additional detail tabs in the future (e.g., Activity, Attachments).

9. As a lab researcher, I want smooth CSS transitions when panels expand, collapse, slide in, and slide out, so that the spatial relationship between panels is clear.

10. As a lab researcher, I want the `>` button on a row to only appear when I hover over that row, so that the table stays visually clean when I'm scanning.

11. As a lab researcher, I want the search bar in the nav to be hidden when in the three-panel expanded view, since the entity list is collapsed and filtering is not actionable.

12. As a lab researcher on a narrow screen, I want the three-panel layout to stack vertically instead of breaking, so that I can still use the feature on smaller displays.

13. As a lab researcher, I want the detail summary card to show only the essential entity metadata (ID, name, type, dates, source), so that the more-detail panel can house the full properties table and future tabs.

14. As a future developer, I want the more-detail panel to be a separate component with a tab bar, so that adding new tabs (Activity, Files, etc.) only requires adding a tab entry and its content component.

## State Machine

The view is driven by a single `viewState` enum (or equivalent discriminated union):

```
viewState: "list" | "detail" | "expanded"
```

```
                    row click
    ┌──────┐  ────────────────►  ┌────────┐
    │ list │                     │ detail │
    └──────┘  ◄────────────────  └────────┘
       ▲         [x] button          │
       │                             │ [>] on detail card header
       │                             │ [>] on row (skip detail)
       │ [x] button                  ▼
       │          ┌──────────────┐
       └────────── │  expanded    │
                   └──────────────┘
                       │
                       │ [<] on detail card header
                       │ [>] on collapsed strip
                       ▼
                   ┌────────┐
                   │ detail │
                   └────────┘
```

### Transition Table

| Trigger | From | To | Notes |
|---------|------|----|-------|
| Click row body (non-`>` area) | `list` | `detail` | Sets `selectedEntity`, opens summary card |
| Click `>` on a row | `list` | `expanded` | Sets `selectedEntity`, opens all three panels |
| Click `>` on detail card header | `detail` | `expanded` | List collapses to strip, more-detail slides in |
| Click `<` on detail card header | `expanded` | `detail` | More-detail slides out, list re-expands |
| Click `>` on collapsed strip | `expanded` | `detail` | Same as `<` behavior |
| Click `x` on detail card header | `detail` | `list` | Clears selection, closes all panels |
| Click `x` on detail card header | `expanded` | `list` | Clears selection, closes all panels |
| Click currently selected row | `detail` | `list` | Toggle-off (existing behavior preserved) |

No entity selection is possible while in `expanded` state — the table rows are fully hidden. The user must collapse back to `detail` first, then select a different entity.

## Implementation Decisions

### State Model

- Single explicit state variable: `viewState: "list" | "detail" | "expanded"` (union type or enum).
- This replaces the current boolean-like `selectedEntity !== null` pattern. The `selectedEntity` / `selectedId` state still exists for tracking *which* entity is selected, but `viewState` determines *which panels are visible*.
- This prevents invalid states (e.g., expanded without a selected entity).

### Panel Layout (CSS)

- Three-panel flexbox layout inside `.lims-master-detail`. All three panels are DOM children.
- **Left (master panel):** In `list`/`detail` states: `flex: 1 1 0` (normal width). In `expanded` state: collapses to ~40px width with `overflow: hidden` and a `flex-basis`/`width` CSS transition (0.3s ease, already present on `.lims-master-panel`).
- **Middle (detail panel):** Always renders when `selectedEntity` is set (both `detail` and `expanded` states). Slides in with existing `lims-slide-in` keyframe animation. Shifts position as flex redistributes when master panel collapses.
- **Right (more-detail panel):** Only renders in `expanded` state. Slides in with the same `lims-slide-in` keyframe. On exit, a `slide-out-right` animation plays (matching duration 250ms), managed via a manual delay state pattern.
- The existing `.lims-page.has-detail` full-viewport breakout applies to both `detail` and `expanded` states.

### Collapsed Strip (Left Panel in Expanded State)

- Narrow ~40px vertical strip with a subtle background or right border to visually separate from the content panels.
- Contains a single `>` button at the top-left, positioned under the nav bar.
- The entity table, "Load More" button, and all row content are hidden (`overflow: hidden` on the panel).
- Button styling matches the existing `lims-detail-close` class (32x32, bordered, subtle gray, hover darkens).

### Row `>` Button

- New `<th>` (empty header) at the end of the table, ~40px wide.
- Each row gets a final `<td>` containing a `>` text character styled as a bordered button (matching `lims-detail-close`).
- The button is hidden by default, appears on `.lims-row:hover` via CSS.
- Click handler calls `e.stopPropagation()` to prevent triggering the row body click (which goes to `detail` state). Instead, it goes directly to `expanded` state.

### Detail Card Header Buttons

**Detail state (two-panel):**
```
[BADGE]  Entity Name          [>] [x]
```

**Expanded state (three-panel):**
```
[BADGE]  Entity Name          [<] [x]
```

- `[x]` is always present, always transitions to `list`.
- `[>]` appears in `detail` state, transitions to `expanded`.
- `[<]` replaces `[>]` in `expanded` state, transitions to `detail`.
- Both styled consistently with the existing `lims-detail-close` button (32x32, bordered, subtle).

### Summary Card Content (Middle Panel)

In both `detail` and `expanded` states, the middle detail card shows a compact summary:
- Entity ID badge
- Entity name
- Type (with prefix)
- Created date
- Creator username
- Source entry link (if applicable)

The **properties table** is moved OUT of this card and into the more-detail panel's Properties tab. This is the key content split: summary here, details there.

### More-Detail Panel (Right Panel, Expanded Only)

**Visual structure:**
- Card with no separate header — the tab bar at the top serves as the card's heading.
- Tab bar: underline-style tabs. Active tab has a blue bottom-border accent. Inactive tabs are muted. Pure CSS, no library.
- Currently a single tab: **Properties**.

**Properties tab content:**
- The properties table (field/value table) moved from the old detail card.
- If properties are empty, show a muted placeholder message ("No properties defined" or similar).
- The tab bar is ready for future tabs (Activity, etc.) — adding a tab means adding a new entry to a tab config array and rendering its content component.

**Placeholder behavior:**
- The tab structure is built now with one tab. No empty "coming soon" tabs — only real tabs are shown. When Activity data is supported, an "Activity" tab is added to the config.

**Exit animation for the more-detail panel:**
- When transitioning from `expanded` → `detail` or `expanded` → `list`, set a CSS class `is-exiting` on the panel that triggers a `slide-out-right` keyframe animation (250ms).
- Use a temporary state (`exiting: boolean`) and a `setTimeout` to delay the actual state transition until the animation completes, then clean up.
- Pattern (pseudocode):

```
const [exiting, setExiting] = useState(false);
const collapseFromExpanded = () => {
  setExiting(true);
  setTimeout(() => {
    setViewState("detail");
    setExiting(false);
  }, 250);
};
```

### Nav Search Bar

- The nav search bar (`.nav-search-bar`) is hidden via conditional rendering when `viewState === "expanded"`.
- Reappears when transitioning back to `detail` or `list`.
- The search/filter state (URL params) is NOT cleared — if the user searched while in `detail` state, the filtered results are still there when they collapse back.

### Component Extraction

The existing `LimsList.tsx` is split into focused components:

| Component | File | Responsibility |
|-----------|------|----------------|
| `LimsDetailCard` | `frontend/src/components/LimsDetailCard.tsx` | Middle panel summary card (header with buttons + summary fields). Props: `entity`, `viewState`, callbacks for `[x]`, `[>]`, `[<]`. |
| `LimsMoreDetailPanel` | `frontend/src/components/LimsMoreDetailPanel.tsx` | Right panel with tab bar and tab content. Owns `activeTab` state. Renders properties table. Props: `entity`, `isExiting` (for exit animation). |
| `LimsCollapsedStrip` | `frontend/src/components/LimsCollapsedStrip.tsx` | Narrow left strip with `>` button. Rendered inside `.lims-master-panel` when `viewState === "expanded"`. Props: `onExpand` callback. |
| `LimsList` | `frontend/src/pages/LimsList.tsx` | Orchestrator page. Owns `viewState`, `selectedEntity`, `selectedId`. Renders the layout and delegates to sub-components. |

### Responsive Behavior

- Existing `@media (max-width: 800px)` breakpoint stacks panels vertically via `flex-direction: column`.
- In `expanded` state with three panels visible, they stack: collapsed strip on top (narrow horizontal bar), detail card middle, more-detail panel bottom.
- No special handling needed beyond what the existing media query already provides.

### CSS Additions

New CSS classes needed (in `frontend/src/styles.css`):

- `.lims-master-detail.is-expanded` — modifier for the three-panel state
- `.lims-master-panel.is-collapsed` — collapsed to ~40px strip
- `.lims-collapsed-strip` — the narrow strip content (button)
- `.lims-collapsed-strip-btn` — the `>` toggle button in the strip
- `.lims-more-detail-panel` — the right panel, with slide-in animation
- `.lims-more-detail-panel.is-exiting` — slide-out-right animation
- `.lims-row-expand-btn` — the `>` button in each table row
- `.lims-tab-bar` — tab bar container
- `.lims-tab` / `.lims-tab.is-active` — individual tabs with underline style
- `.lims-tab-content` — tab content area
- `@keyframes lims-slide-out-right` — exit animation (translateX to right + opacity 0)

Refinements to existing CSS:
- Properties-related styles (`.detail-properties`, `.properties-table`, `.prop-key`) remain unchanged — they just move from the detail card to the more-detail panel.
- Remove `.detail-properties` from `.lims-detail-card` scope (now rendered inside `.lims-more-detail-panel`).

### No API Changes

This PRD is purely a frontend layout and interaction change. No new API endpoints, no schema changes, no backend modifications. The same entity data fetched by `LimsList` is passed down to the new sub-components.

## Testing Decisions

### What Makes a Good Test
- Test external behavior: what the user sees and can interact with, not internal React state.
- Verify state transitions: clicking buttons changes the visible panels correctly.
- Verify content: the correct entity data appears in each panel.
- Do NOT test CSS animations or hover states (these are visual, best verified manually).

### Modules to Test
- Component rendering tests for `LimsDetailCard`, `LimsMoreDetailPanel`, `LimsCollapsedStrip`, and the main `LimsList` page.
- Interaction tests: clicking the row `>` button opens expanded view, clicking `[<]` collapses back, clicking `[x]` returns to list, clicking a row body opens detail.

### Prior Art
- No existing frontend component tests in this codebase. This feature is small enough that manual verification via the browser is the primary QA strategy for now.
- If tests are added, use the pattern from the backend test suite (`backend/lims/tests/`) for structure and assertions.

## Out of Scope

- **Activity tab content** — the tab bar supports future tabs, but Activity data requires backend work (action/event tracking on entities) that is not part of this PRD.
- **Prev/next entity navigation** — arrow buttons to navigate between entities in the detail panel are a future feature.
- **Hover cards or previews** on entity badges.
- **Additional detail tabs** beyond Properties — the infrastructure supports them, but they are not implemented here.
- **Mobile-specific layout** beyond the existing responsive stacking.
- **Persisting the view state** across page navigations (always resets to `list` on mount).
- **Keyboard shortcuts** for panel navigation.
- **In-app documentation or onboarding tooltips** for the new layout.

## Further Notes

- The three-panel layout mirrors common patterns in email clients (list → preview → full detail) and IDEs (file tree → editor → details panel). It should feel familiar to users.
- The properties table moving from the summary card to the more-detail panel is the key UX change. The summary card becomes a quick-glance reference, and the properties tab is where you go for structured data.
- Future tabs (Activity, Attachments, Related Entities, etc.) will each be a new component rendered inside `LimsMoreDetailPanel`'s tab content area by adding entries to the tab configuration.
- The exit animation delay-state pattern is intentionally minimal — no animation library dependency. It can be extracted into a reusable `useExitAnimation` hook later if used elsewhere.
- All button styling should reuse the existing `lims-detail-close` base styles to maintain visual consistency.
- The `viewState` typed union should be defined in `frontend/src/types/lims.ts` alongside the existing LIMS types.

---

## Design Decisions Reference (Q&A from Grilling Session)

For context, these are the key decisions reached during the design grilling session:

1. **State model:** Explicit enum (`"list" | "detail" | "expanded"`) rather than additive booleans — prevents impossible states.
2. **Row click vs `>`:** Row body click → `detail` (current behavior). `>` click → `expanded` directly. Both work, `>` is an accelerator.
3. **`[x]` behavior:** Always returns to `list` (close everything), in both states. Not a "back" button.
4. **`[>]` / `[<]` behavior:** `>` goes detail→expanded. `<` goes expanded→detail. The button swaps icon based on state.
5. **Collapsed strip:** No rows visible, no entity selection. Just the `>` toggle button at top-left. Must collapse to `detail` first to select a different entity.
6. **Panel CSS:** Flexbox with show/hide via CSS classes. No absolute positioning or grid refactor.
7. **More-detail content:** Tab bar with single "Properties" tab now. Placeholder message if no properties. Future tabs (Activity) add entries to the tab config.
8. **Row `>` icon:** Plain text `>` character in a button styled like the close button. Appears on row hover only (`:hover` pseudo-class on `.lims-row`). Dedicated `<td>` with `stopPropagation`.
9. **Collapsed strip placement:** Top-left, under the nav bar, subtle border/background for visual separation.
10. **Nav search bar:** Hidden in `expanded` state.
11. **Properties table:** Moved from middle detail card to the more-detail panel's Properties tab. Detail card becomes a compact summary.
12. **Tab styling:** Underline-style tabs (blue bottom-border on active, muted on inactive). Pure CSS.
13. **Exit animations:** 250ms slide-out-right via CSS keyframes, managed by a `setTimeout` delay before unmounting (manual pattern, no library).
14. **Responsive:** Existing `@media (max-width: 800px)` stacking handles all three states.
15. **Component extraction:** Four components — `LimsDetailCard`, `LimsMoreDetailPanel`, `LimsCollapsedStrip`, `LimsList` (orchestrator).
