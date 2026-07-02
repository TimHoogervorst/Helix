## Problem Statement

The ELN entry page currently has no metadata panel. When viewing or editing an entry, the researcher cannot see who owns the entry, what project it belongs to, which entities are linked, what files are attached, or what activity has occurred. This information is essential context for lab work. The Helix prototype shows a comprehensive right-side metadata panel at 288px width.

## Solution

Implement the right-side metadata panel (288px, visible at `xl` breakpoint) on the ELN entry page. The panel displays four sections: **Metadata** (owner, witness, project, dates, instrument, status), **Linked Entities** (entries, reagents, plates, cell lines connected to this entry), **Attachments** (files uploaded to this entry), and **Activity** (chronological feed of actions on this entry). All values are placeholders for now — real data will be wired in future PRDs.

## User Stories

1. As a researcher, I want to see who owns an entry and who is the designated witness, so that I know who is responsible for this work.
2. As a researcher, I want to see which project an entry belongs to, so that I can understand the research context.
3. As a researcher, I want to see when an entry was started and which instrument was used, so that I have experimental context.
4. As a researcher, I want to see the entry's status (Draft, In Progress, Complete), so that I know its workflow state at a glance.
5. As a researcher, I want to see which entities are linked to this entry, so that I can navigate to related materials.
6. As a researcher, I want to see files attached to this entry with their sizes, so that I can access raw data.
7. As a researcher, I want to see a chronological activity feed, so that I can track what changes have been made and by whom.
8. As a researcher on a smaller screen, I want the metadata panel to hide, so that I have more room for editing.
9. As a researcher, I want linked entities to be clickable, so that I can navigate to the entity's detail page.
10. As a researcher, I want the metadata panel to be sticky while scrolling the editor content, so that context is always visible.

## Implementation Decisions

### Panel Layout
The metadata panel is a `<aside>` element inside the content + metadata flex row (created in PRD #3):

```
<aside className="hidden w-72 shrink-0 border-l border-hairline bg-surface/60 xl:block">
  <div className="sticky top-0 max-h-screen overflow-y-auto px-5 py-6">
    <!-- Sections -->
  </div>
</aside>
```

Key properties:
- Width: `w-72` (288px)
- Visibility: `hidden xl:block` — only visible at xl breakpoint (1280px+)
- Position: `sticky top-0` with `max-h-screen overflow-y-auto` — scrolls independently

### Section 1: Metadata

```
<div className="mb-6">
  <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Metadata</div>
  <dl className="space-y-2.5 text-[13px]">
    <!-- key-value pairs: justify-between layout -->
  </dl>
</div>
```

Placeholder key-value pairs:

| Key | Placeholder Value |
|-----|-------------------|
| Owner | Dr. Mira Kato |
| Witness | Pending — J. Silva (italic, muted) |
| Project | CRISPR-Cas9 Opt. |
| Started | 2026-06-28 09:14 |
| Instrument | Nanodrop One · Bio-Rad C1000 |
| Status | "In progress" chip (warn-colored) |

The Status field uses a chip/badge with semantic coloring (warn = amber for "In progress", success = green for "Complete").

### Section 2: Linked Entities

```
<div className="mb-6">
  <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Linked entities</div>
  <div className="space-y-1.5">
    <!-- Entity link buttons -->
  </div>
</div>
```

Each linked entity is a clickable button showing:
- Icon (semantic: DNA for genes, Flask for reagents, Beaker for plates, etc.)
- Entity name (truncated)
- Display ID in mono font (right-aligned, muted)

Placeholder entities:
1. EMX1 gene (GENE-EMX1) — DNA icon
2. HEK293T · WT (CELL-0012) — Flask icon
3. Plate P-24-118 (PLT-118) — Beaker icon
4. Cas9-HF1 stock (REG-1042) — Flask icon

Buttons are styled as bordered cards with `hover:bg-background` transition.

### Section 3: Attachments

```
<div className="mb-6">
  <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Attachments</div>
  <div className="space-y-1.5 text-[13px]">
    <!-- File rows -->
  </div>
</div>
```

Each attachment shows:
- Paperclip icon (muted)
- Filename in mono (truncated)
- File size (right-aligned, muted, 11px)

Placeholder attachments:
1. raw_gel_2026-06-30.tif (4.2 MB)
2. plate_layout.xlsx (18 KB)
3. sequencing_reads.fastq.gz (112 MB)

Styled as bordered cards, not clickable (placeholder).

### Section 4: Activity Feed

```
<div>
  <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Activity</div>
  <ul className="space-y-2 text-[12px]">
    <!-- Activity items -->
  </ul>
</div>
```

Each activity item shows:
- Small colored dot (primary/70)
- Bold username
- Action description in muted
- Timestamp (rightmost, muted/70)

Placeholder activities (most recent first):
1. Mira K. added bar chart FIG-01 · 14 min ago
2. Jordan S. commented on g4 dropout · 2 h ago
3. Mira K. linked reagent REG-1042 · 5 h ago
4. System autosaved v0.4 · just now

### Panel Styling
- All section headers use mono, uppercase, tracking-widest, 10px, muted-foreground
- All key-value pairs use 13px text with muted-foreground for keys, right-aligned values
- Linked entity and attachment cards use `border border-hairline bg-panel` with `rounded-md`
- Cards have `px-2.5 py-1.5` padding
- Consistent `space-y-2.5` spacing between items within sections
- 6px (mb-6) spacing between sections

### Files to Modify
- **MODIFY**: `frontend/src/pages/ElnDetail.tsx` — add the metadata panel `<aside>` with all four sections

## Testing Decisions

### What Makes a Good Test
- Test that metadata panel renders at xl breakpoint
- Test that metadata panel is hidden below xl breakpoint
- Test that all four section headers render (Metadata, Linked entities, Attachments, Activity)
- Test that metadata key-value pairs render with placeholder values
- Test that linked entity buttons render with correct icons and display IDs
- Test that attachment rows render with filenames and sizes
- Test that activity items render with usernames and timestamps
- Test that the status chip renders with the correct color
- Do NOT test exact visual styling — test for presence of elements and key text

### Modules Under Test
- `ElnDetail.test.tsx` — metadata panel rendering, section presence, placeholder data

### Prior Art
- Existing `ElnDetail.test.tsx` patterns
- React Testing Library queries for text content and element presence

## Out of Scope
- Real metadata from the backend (owner, witness, project, etc. from API)
- Real linked entities with working navigation
- Real file attachments with upload/download
- Real activity feed from the backend
- Editing metadata inline
- Adding/removing linked entities
- Uploading attachments
- Witness workflow
- Responsive behavior beyond the xl breakpoint toggle

## Further Notes

- The metadata panel is intentionally placed inside `ElnDetail.tsx` rather than as a separate component, since it is tightly coupled to the ELN entry context. It can be extracted into a separate component in a future PRD when it grows more complex.
- The `sticky top-0` positioning means the panel scrolls with the page but stays in view. This works well for long entries where the researcher scrolls through content but wants to reference metadata.
- The linked entities section uses Lucide icons that match the entity type: `Dna` for genes/sequences, `FlaskConical` for reagents/cell lines, `Beaker` for plates/containers.
- The status chip uses the semantic color system from PRD #1: `bg-warn text-warn-foreground` for "In progress", `bg-success text-success-foreground` for "Complete", `bg-muted text-muted-foreground` for "Draft".
- Activity icons (colored dots) use `bg-primary/70` — the `/70` opacity modifier comes from Tailwind v4's color-mix support.
