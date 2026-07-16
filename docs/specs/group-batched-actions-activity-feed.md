# Group Batched Block Actions in Activity Feed

> **Parent:** [#250](https://github.com/TimHoogervorst/Helix/issues/250) (design discussion)
> **Spec issue:** [#259](https://github.com/TimHoogervorst/Helix/issues/259)
> **Status:** Ready for implementation
> **Date:** 2026-07-16

## Problem Statement

After a save cycle that touches multiple blocks — for example, editing a table cell AND checking off a protocol step in the same save — the activity feed shows multiple individual action rows:

- `admin edited a LimsTable`
- `admin Protocol 'Seeding of Cells' edited`

Each row is individually correct, but the feed lacks visual grouping. These rows are part of the same logical edit — a single save that contained two changes. The feed should reflect that cohesion.

## Solution

Multiple block actions from the same save appear as a single collapsible group entry in the activity feed:

> **admin** made several edits ▸
>
> (expanded:)
> **admin** made several edits ▾
>   └─ Edited a LimsTable
>   └─ Protocol 'Seeding of Cells' edited

The group row summarizes what happened inside. Individual actions are nested underneath and visible when expanded.

The grouping key is the `request_id` that the batch endpoint already assigns to all action rows from a single save. No new database model or API endpoint is needed — this is a frontend presentation concern.

## User Stories

1. As a scientist editing an entry, I want multiple block changes from the same save to appear as a single grouped entry in the activity feed, so that I can see at a glance how many *saves* happened rather than counting individual block-level rows.

2. As a scientist, I want the group row to show a meaningful summary ("Edited a LimsTable and a Protocol") for 2 changes, so that I don't have to expand the group to understand what happened.

3. As a scientist, I want the group row to show a compact summary ("Made several changes") when there are 3 or more block changes, so that the summary text doesn't become unwieldy.

4. As a scientist, I want groups to be collapsed by default, so that the feed stays compact and I can expand groups selectively when I want detail.

5. As a scientist, I want to expand and collapse groups with a single click, so that I can inspect the details of a particular save and then collapse them again.

6. As a scientist, I want saves that contain only a single block change to render as a flat row (no group wrapper), so that I don't have to click to expand something that's already fully visible.

7. As a scientist, I want pending (pre-save) items to continue appearing individually, so that I see immediate feedback while editing without confusing grouping before the save completes.

8. As a scientist, I want the grouping to handle mixed action types naturally — if a save includes a create, an edit, and a delete, the summary should read "Created a Comment, edited a LimsTable, and removed a Protocol" (or the compact form for 3+).

## Implementation Decisions

### Grouping is purely a frontend concern

The `request_id` column already exists on every `ElnAction` row. The batch endpoint (`POST /api/eln/entries/{display_id}/actions/batch/`) assigns a shared UUID to all rows from a single batch. The activity feed groups rows by this existing column — no new database model, no new API endpoint, no API response shape change beyond exposing `request_id` in the serializer.

### The `request_id` field must be exposed in the API

The `ElnActionSerializer` currently omits `request_id` from its `fields` list. It will be added so the frontend receives the grouping key.

### Grouping key is `request_id`

All action rows from a single batch POST share the same `request_id` UUID, assigned server-side in `entry_actions_batch()`. The frontend groups consecutive confirmed rows that share this value. Rows that lack a `request_id` (e.g., actions logged before the field was added, or single-action paths that don't set it) are never grouped.

### Grouping runs in the data-owning component, not the shared presentation component

The grouping transform lives in `ActivityFeedBlock` — the component that already owns data fetching, pending/confirmed merging, and type mapping. The shared `<Activity>` component receives the already-grouped list and learns to render groups visually, but it does not know *why* items are grouped or what the grouping key is. This keeps `<Activity>` reusable across mods while ELN-specific grouping logic stays in the ELN mod.

### Summary row format

- **1 child:** Rendered flat — no group wrapper at all.
- **2 children:** "Edited a LimsTable and a Protocol" — both action messages are enumerated with "and."
- **3+ children:** "Made several changes" — a compact static string.

The child messages are derived from the block's registered `messages` (e.g., `"edited a LimsTable"`). Mixed verbs (created/edited/deleted) come through naturally — the summary just joins whatever the child `metadata.message` strings are.

### All groups are collapsed by default

When the feed first renders, every group row shows in collapsed state with a chevron or expand indicator. The user clicks to expand.

### Pending items are never grouped

Pending items lack a `request_id` (it is assigned server-side at batch time). They continue to appear as individual rows with the existing `opacity-60 animate-pulse` styling. Grouping only applies to confirmed items after they are fetched from the API.

### Grouping is consecutive-only

The grouping transform scans the sorted list for consecutive confirmed items with the same non-null `request_id`. If two rows from the same batch are separated by an unrelated row, they are not grouped. In practice this does not occur — batch rows share near-identical timestamps and the feed is ordered by `-created_at`.

### Reconciled grouping flow

1. Pending items accumulate individually (unchanged).
2. On `eln.actions.flushed`, pending items are removed by `blockInstanceId:actionType` key match (unchanged).
3. On `eln.entry.saved`, all pending items are cleared and `refetch()` is called (unchanged).
4. On refetch, confirmed items arrive from the API with `request_id` on each row.
5. A new `groupedDisplayActions` memo groups consecutive confirmed rows sharing the same non-null `request_id` into `GroupedDisplayItem` wrappers.
6. The grouped list is passed to `<Activity>`.

### New type: `GroupedDisplayItem`

A discriminated union element introduced in the shared activity types:

```typescript
interface GroupedDisplayItem {
  type: "group";
  id: string;            // synthetic: "group-{requestId}"
  summary: string;       // pre-computed summary text
  children: DisplayActionItem[];
  createdAt: string;     // most recent child's timestamp (for sort stability)
  performedBy: ActionUser; // from the most recent child (the actor)
  state: "confirmed";    // groups only contain confirmed items
}
```

### `<Activity>` learns to render groups

The `<Activity>` component's render loop branches on `"type" in item` — group items render a collapsible header row with a chevron toggle and the summary text. When expanded, each child renders as a nested `<ActivityItem>`.

### `<ActivityItem>` gains an indented prop

Group children are rendered with additional left margin or padding to visually indicate nesting. An `indented` boolean prop on `<ActivityItem>` controls this.

## Testing Decisions

### What makes a good test

Tests should exercise the grouping behavior from the user's perspective: given a set of confirmed items with various `request_id` values, the feed renders group wrappers for runs of 2+ and flat rows for singletons. Do not test internal implementation details like the exact memo dependency array or the internal state of the collapse toggle.

### Tested modules

- **`ActivityFeedBlock`** — the grouping transform logic: given input arrays, produce the correct grouped output. Can be unit-tested by extracting the grouping function as a pure utility.
- **`<Activity>`** — rendering groups: collapsed/expanded states, expand/collapse toggle, indented children, no group wrapper for singletons.
- **`ElnActionSerializer`** — verify `request_id` appears in the serialized output.

### Prior art

Existing tests for `<Activity>` exercise loading, empty, error, and normal states. Tests for `ActivityFeedBlock` exercise pending item creation and reconciliation. The grouping tests follow the same pattern — render the component with known data, assert on the DOM output.

## Out of Scope

- Cross-save grouping (actions across multiple saves)
- User-configurable grouping preferences
- Grouping in the CFR Part 11 audit export
- Server-side grouping or a new `BatchAction` database model
- Grouping for entry-level actions (only block actions from the batch endpoint are grouped)
- Adding `request_id` to serializers other than `ElnActionSerializer`

## Further Notes

- Single-action batches (a save that produced exactly one block action) render as flat rows — no group wrapper. This is intentional to avoid adding a click target for content that is already fully visible.
- The `request_id` on action rows created by the single-action path (`ActionLoggingMixin`) is a per-HTTP-request UUID — since the save queue is serial, each single-action save gets a unique `request_id`, so they never group accidentally.
- The existing reconciliation mechanism (key-based matching via `eln.actions.flushed`) is unchanged.
