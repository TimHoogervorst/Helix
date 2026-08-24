# ELN Workspace Bleed Layout

**Status:** Proposed
**Date:** 2026-08-24

## Context

The ELN workspace originally described its content as a five-zone flex layout
with fixed gutters, a comment aside, and stretchable blocks. That model made
the reading column unnecessarily narrow at intermediate widths and coupled
table width to a `stretchMode` control.

The workspace now needs one alignment model for ordinary document content and
three explicit grid tracks for tables. The layout must provide a bounded
reading column, let tables use available horizontal space, and keep all bleed
inside the workspace rather than extending to the literal window edge.

## Decision

Use a three-track grid inside `1.5rem` of content padding:

```text
1fr / min(48rem, 100%) / 1fr
```

The ProseMirror editor owns this grid. Direct children use the center track by
default. Result Tables use the **Full-Bleed** role and span all three tracks.
Registry Tables and Plain Tables use **Dynamic Bleed**: they align to the
center track's left edge and extend through the available right-side tracks,
with horizontal scrolling for columns that still do not fit.

The mechanism is a negative-margin breakout from the text-column alignment
point rather than the earlier full-bleed-grid breakout arithmetic. The
breakout supplies the horizontal extension, while CSS subgrid anchors the
Dynamic Bleed child to the editor's fluid center track as the available width
changes. The breakout is bounded by the content padding and persistent shell
chrome; it must never reach the literal viewport edge.

CSS subgrid is intentionally used here because it is supported by current
evergreen browsers and preserves the alignment relationship without duplicating
track calculations. Browsers without subgrid support retain the normal center
track layout rather than gaining an unbounded breakout.

## Rationale

### One reading column

Making the editor the grid container gives prose, headings, metadata, and table
alignment one stable reference point. The `48rem` cap protects readability on
wide screens without squeezing content on narrow screens.

### Explicit table roles

Full-Bleed and Dynamic Bleed describe behavior directly. They replace the
ambiguous stretch toggle and ensure Registry and Plain Tables share the same
layout semantics while Result Tables can use the complete content width.

### Bounded overflow

Content padding and persistent chrome remain hard boundaries. Tables can use
the available content area and scroll their own columns without turning the
workspace into a viewport-edge-to-edge surface.

## Consequences

- Ordinary document blocks remain aligned to a capped, readable text column.
- Result Tables span the content grid, while Registry and Plain Tables align to
  the text column and bleed dynamically to the right.
- Dynamic Bleed behavior depends on CSS subgrid in browsers that support it,
  with a bounded center-column fallback elsewhere.
- The glossary must use Full-Bleed and Dynamic Bleed rather than the retired
  Block Stretch and Left Gutter terms.

## Rejected Alternatives

- **Retain the five-zone flex layout:** rejected because fixed gutters,
  counterweights, and a comment aside made the reading column fragile.
- **Keep a user-controlled stretch mode:** rejected because table layout is a
  block role and should not require persisted presentation state.
- **Use unbounded negative margins:** rejected because bleed must stop at
  content padding and persistent chrome.
- **Duplicate center-track calculations in each table:** rejected because CSS
  subgrid keeps Dynamic Bleed anchored to the editor's actual fluid track.
