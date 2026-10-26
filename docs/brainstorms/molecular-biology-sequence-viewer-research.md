# Molecular Biology Essentials: sequence-viewer research

Research date: 2026-10-26. Resolves [Research sequence-viewer interaction patterns and reusable components](https://github.com/TimHoogervorst/Helix/issues/718), within [Molecular Biology Essentials demo specification](https://github.com/TimHoogervorst/Helix/issues/714). Research findings and prototype recommendations; no dependency choice or human acceptance is recorded here.

## Findings

SnapGene demonstrates coordinated map and sequence panels: selecting sequence, features, primers or enzyme sites reveals the same region in the other panel. Users can resize panels and choose horizontal or vertical arrangement. This is useful interaction inspiration, not evidence of an embeddable component license. [Official split-view guide](https://support.snapgene.com/hc/en-us/articles/10383851677972-View-a-Sequence-with-a-Split-Window).

SnapGene treats protein display as its own presentation: configurable feature categories, residue colors, one/three-letter amino-acid notation, wrapping, and minimap. Helix should therefore avoid presenting a protein as DNA with different letters. [Official protein-view guide](https://support.snapgene.com/hc/en-us/articles/10383848479380-View-Options-for-Protein-Sequences).

Addgene separates map/features, sequence formats and reverse complement, digest-site inspection, and translation. Its digest interface distinguishes unique cutters, non-cutters and expected sites. This supports keeping sequence inspection distinct from committing a scientific operation. Its website maps are powered by SnapGene Server; the public website is not an open-source viewer dependency. [Analyze Sequence Guide](https://www.addgene.org/analyze-sequence/guide/), [Addgene's map explanation](https://help.addgene.org/hc/en-us/articles/115005662726-How-does-Addgene-create-plasmid-maps).

## Reusable candidates

Sources inspected at SeqViz commit `7a0e8f4c45ad5f4d076178f54f08f071e91d7b6a` and TeselaGen tg-oss commit `a72264c8e681c3aa91050abbeafc635c429cbbae`. These are source snapshots, not a claim that an installed npm package was tested.

| Dimension | SeqViz | TeselaGen Open Vector Editor |
| --- | --- | --- |
| Embedding | React component or JavaScript viewer; controlled selection and selection callback | Full editor uses Redux; smaller circular/linear viewer avoids Redux |
| Displays | DNA, RNA, protein; circular and detailed linear views | Circular, rail map and sequence panels; protein mode |
| Annotations | Directional, colored ranges; zero-based half-open coordinates | Strand-aware features and joined locations; protein annotation conversion needs special care |
| Restriction overlays | Custom enzyme definitions include recognition sequence and two cut offsets | Cut-site visibility controls and dedicated enzyme viewer |
| Interaction extension | Selection state is suitable for a Helix-owned toolbar | Copy/save hooks and contextual-menu overrides |

The table summarizes the [SeqViz API](https://github.com/Lattice-Automation/seqviz/blob/7a0e8f4c45ad5f4d076178f54f08f071e91d7b6a/README.md) and [current OVE API](https://github.com/TeselaGen/tg-oss/blob/a72264c8e681c3aa91050abbeafc635c429cbbae/packages/ove/README.md). SeqViz also documents keyboard copy/select-all, complementary sequence display and externally supplied colors. OVE's protein mode uses underlying DNA-indexed annotations, with a conversion helper for amino-acid indices; its generated degenerate DNA must not become authoritative Helix sequence data. Neither API description alone proves complete keyboard accessibility or theme compatibility.

SeqViz's package declares MIT licensing, version 3.10.25 and React 19-compatible peers. Its runtime dependencies include seqparse and a font loader. Helix currently uses React 19 and Vite, so actual bundling, font/network behavior and clipboard behavior remain integration checks. [SeqViz package](https://github.com/Lattice-Automation/seqviz/blob/7a0e8f4c45ad5f4d076178f54f08f071e91d7b6a/package.json), [Helix package](../../package.json).

The current OVE home is tg-oss and package name is `@teselagen/ove`; legacy `open-vector-editor` examples should not determine adoption. The repository declares MIT licensing. The inspected package is 0.8.42 and lists React/React DOM 18, Blueprint 3 and Redux dependencies. This creates integration and styling questions for Helix, not proof that embedding is impossible. Preserve license notices and inspect the selected distribution's dependency licenses before shipping. [Repository](https://github.com/TeselaGen/tg-oss/tree/a72264c8e681c3aa91050abbeafc635c429cbbae), [package](https://github.com/TeselaGen/tg-oss/blob/a72264c8e681c3aa91050abbeafc635c429cbbae/packages/ove/package.json), [license](https://github.com/TeselaGen/tg-oss/blob/a72264c8e681c3aa91050abbeafc635c429cbbae/LICENSE).

## Performance and accessibility evidence

SeqViz renders visible sequence blocks through its infinite-scroll component. Its selection handler explicitly coordinates circular clicks with scrolling the detailed sequence. These are useful foundations; they provide no measured upper limit for sequence length or feature density. [Scrolling implementation](https://github.com/Lattice-Automation/seqviz/blob/7a0e8f4c45ad5f4d076178f54f08f071e91d7b6a/src/Linear/InfiniteScroll.tsx), [selection implementation](https://github.com/Lattice-Automation/seqviz/blob/7a0e8f4c45ad5f4d076178f54f08f071e91d7b6a/src/SelectionHandler.tsx).

OVE's row view uses a variable-size ReactList with row-height estimation. Virtualized rendering is evidence of a performance strategy, not a benchmark. [Row-view implementation](https://github.com/TeselaGen/tg-oss/blob/a72264c8e681c3aa91050abbeafc635c429cbbae/packages/ove/src/RowView/index.js).

Neither candidate was installed or browser-tested in this research. Overlapping-feature legibility, origin-spanning ranges, keyboard range extension, focus containment, screen-reader output, copy transforms, RNA preservation and rendering performance remain explicit acceptance checks. Do not equate a documented copy shortcut with an accessible sequence editor.

## Recommended prototype shape (proposals, not decisions)

Use a Helix-owned profile shell with identity, metadata, results and provenance around a focused sequence panel. The panel should contain a whole-sequence feature map, numbered sequence blocks, feature list and persistent selection summary. A circular DNA map can accompany the detailed linear sequence; topology should remain explicit rather than inferred from the chosen view.

Keep one selection state shared by map, residues and feature list. Show human-readable coordinates and units; make any adapter conversion explicit. Distinguish an empty caret from a full-circle selection and preserve origin-spanning direction. Stack overlapping annotations in lanes and retain text labels and strand arrows so color is not the sole distinction.

Offer visible Copy sequence, Copy complement and Copy reverse complement actions where applicable, with equivalent contextual-menu entries. Name the orientation of copied text. Protein profiles should expose residue counts and protein-relevant actions; nucleotide metrics and restriction overlays must not leak into that mode. GC and melting-temperature presentation should follow the separate scientific research, including assumptions and unavailable states.

Feature colors should store Helix Color Tokens; selection/focus and surface colors should follow Theme Tokens. Resolve colors at the adapter boundary if the component requires concrete values. Recheck after theme changes. The current [styling standard](../standards/styling-standard.md) specifies six seeds, including Card; [proposed ADR 0018](../adr/0018-design-system-and-preferences.md) still describes five. Follow the current standard for the prototype and record this documentation discrepancy rather than inventing a new palette.

## Recommended evaluation order and gates

Try SeqViz behind a disposable adapter first because its controlled selection and peer range fit the small profile-viewer experiment. Compare OVE if its rail map, richer annotation editing or enzyme presentation avoids substantial custom work. A custom renderer remains an option if adapting either candidate becomes more expensive than the bounded demo viewer. This is a research recommendation; the human-reviewed prototype and integration results determine the choice.

1. Exercise DNA, RNA with U, and protein fixtures without implicit conversion. Include one-base, reverse-strand, overlapping, joined and origin-spanning features; distinguish supported cases from deliberate prototype omissions.
2. Select in every view, verify exact copied characters, and compare complement versus reverse-complement actions. Test boundary positions, empty/full selection and reverse direction.
3. Navigate without a mouse: focus viewer, enter a coordinate range, choose a feature, copy, open actions and leave the viewer. Expose a textual feature table and selection summary.
4. Use actual Helix themes and narrow layouts. Verify label collisions, feature lanes, numbered blocks, selection contrast and a readable fallback when the specialized viewer is unavailable.
5. Benchmark representative demo data plus a larger stress fixture; vary both length and annotation density. Record browser, hardware, initial render, scrolling and selection latency before setting a supported limit. No limit is established by this research.
6. Keep restriction overlays tied to the same versioned enzyme definitions used by the scientific action; do not silently substitute a viewer's built-in catalog. Keep registration and action execution outside the viewer.

Any dependency belongs to the External Mod and its adapter, consistent with [repository tiers](../adr/0027-repository-tiers-and-golden-rule.md). This investigation does not authorize private Platform imports, production implementation, or acceptance of either prototype.
