# Table Kit

The Shell owns the reusable table foundation. Table blocks own their domain
behavior, while layout behavior comes from `shared/primitives/TableLayout`.

## Layout primitives

- `TableStretch` selects `auto` or `full` layout mode.
- `TableScroll` provides horizontal scrolling with a scrollbar revealed on hover.
- `StickyActionHeader` and `StickyActionCell` keep a right-side action column visible.
- `TableChrome` provides a title bar, optional toolbar slot, table content, and optional add-row affordance.

Workspace geometry is expressed through the `--layout-*` tokens in Shell CSS.
Table consumers must not duplicate the gutter-breakout dimensions or couple
layout behavior to a specific table block.
