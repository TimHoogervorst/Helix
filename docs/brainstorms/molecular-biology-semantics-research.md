# Molecular Biology Essentials: scientific semantics research

Research date: 2026-10-26. Resolves [Research sequence, feature, and restriction-digest semantics](https://github.com/TimHoogervorst/Helix/issues/717), within [Molecular Biology Essentials wayfinder](https://github.com/TimHoogervorst/Helix/issues/714).

This is evidence and a proposed decision baseline, not an accepted product specification. No production implementation or prototype acceptance is implied. Sources below are first-party standards, documentation, code, and supplier guidance; no library was installed or benchmarked. Moving documentation and source branches must be pinned to tested releases during implementation.

## Recommendation

Use explicit molecular types, a coordinate adapter, and a duplex-aware digest representation. Evaluate Biopython for sequence utilities, feature locations and restriction-site discovery; evaluate pydna for preserving both strands and sticky ends in digest products. Do not use a substring-only digest as the scientific model. Keep prediction separate from registration and from laboratory observations.

The agreed scope includes linear **and circular** DNA, DNA/RNA/protein registration and features, and a reusable action foundation. The bounded proposal below keeps those commitments; optional restrictions are questions for the human decision tickets.

## Sequence values, alphabets and orientation

Biopython's IUPAC tables distinguish unambiguous DNA `ACGT`, RNA `ACGU`, and the 20 common amino-acid letters. Extended nucleic alphabets include `R Y S W K M B D H V N`; protein extensions include `B Z J X U O`. These mean uncertainty or additional residues, not arbitrary text. [IUPAC tables](https://raw.githubusercontent.com/biopython/biopython/master/Bio/Data/IUPACData.py)

Proposed contracts:

| Value | Required meaning | Proposed validation |
|---|---|---|
| DNA sequence | Explicit type, reference sequence in 5-prime to 3-prime order, topology, strand model | Normalize case and agreed whitespace; reject U and undeclared symbols |
| RNA sequence | Explicit type, sequence in 5-prime to 3-prime order | Reject T; never silently reinterpret DNA input |
| Protein sequence | Explicit type, residues in N-terminal to C-terminal order | No complement command; decide extended residues and terminal stop separately |

Keep normalization visible at entry. Reject empty sequence values when registration requires a sequence. Treat gaps, stop markers, modifications, FASTA headers and numbered text as separate import/validation decisions, not characters to silently discard. Do not infer molecule type from letters: many strings are valid under more than one alphabet.

Complement and reverse complement are different operations. Biopython exposes DNA and RNA variants, but its DNA complement can interpret U as T and its RNA complement can interpret T as U; therefore library permissiveness must not define the Helix contracts. [Sequence API](https://biopython.org/docs/latest/api/Bio.Seq.html)

Proposed UI: label orientation on copied output. A complement aligned under a displayed 5-prime to 3-prime DNA strand runs 3-prime to 5-prime; reverse complement is its reversed, 5-prime to 3-prime representation. RNA selection lengths use nt and protein lengths aa; reserve bp for paired DNA or a clearly explained reference-length convention.

## Features, coordinates and circular origin

INSDC models features with a key, location and qualifiers. Its location language distinguishes ranges, between-base positions, complement, compound joins and uncertain boundaries. This is the interoperability reference, not a requirement to implement the entire standard. [INSDC feature table](https://www.insdc.org/submitting-standards/feature-table/)

Biopython uses zero-based, end-exclusive feature locations and supports compound locations, strand information and fuzzy boundaries. Its feature extraction handles joins and complements; reverse-strand protein features are disallowed. [SeqFeature API](https://biopython.org/docs/latest/api/Bio.SeqFeature.html)

Proposed internal convention: zero-based half-open intervals, with explicit conversions to one-based inclusive user coordinates. A feature shown as bases 11 through 20 is `[10,20)`, length 10. Cleavage positions are boundaries between bases, not base labels; show both strand cuts.

For a 100-base circle, a forward feature spanning displayed bases 91 through 10 is ordered parts `[90,100), [0,10)`, length 20. Store those parts and orientation explicitly; `start > end` alone is insufficient for general compound features. Preserve the stored origin, distinguish whole-circle selection from an empty selection, and allow a linear overview of a circular molecule to show the join at its ends. Do not rotate a registered sequence silently.

Proposed feature fields: stable ID, label, kind, ordered parts, optional strand, qualifiers, evidence/provenance and platform Color Token. Protein features have no nucleotide strand. RNA strand semantics should be agreed explicitly rather than inherited blindly from DNA. Treat imported fuzzy, remote and mixed-strand locations as unsupported unless deliberately implemented.

## Restriction definitions and digest prediction

Biopython distinguishes recognition sites from cuts, both strands, blunt/5-prime/3-prime overhangs, and enzymes with one or two double-strand breaks. Its search returns one-based positions of the first base after a reference-strand cut; circular searching includes origin-spanning sites. The implementation explicitly leaves methylation susceptibility and buffer compatibility unimplemented. Unknown cleavage definitions are different from an enzyme that happens to have no sites in this input. [Restriction implementation](https://raw.githubusercontent.com/biopython/biopython/master/Bio/Restriction/Restriction.py)

The older [Restriction cookbook](https://biopython.org/DIST/docs/cookbook/Restriction.html) is a useful conceptual introduction but contains legacy alphabet APIs; use current tested APIs for implementation.

Proposed enzyme entity value: recognition motif with an explicit ambiguity alphabet; oriented strand-cut offsets relative to a documented motif boundary; supported cut class; definition provenance/version; and supplier/product metadata kept distinct from the cleavage definition. An enzyme name alone is insufficient. Different products may implement the same nominal recognition/cutting behavior.

pydna's `Dseq` represents duplexes and ends. Its documented `cut` accepts multiple enzymes, preserves overhangs, and returns an empty result when there are no cuts. Its cutsite model uses reference coordinates plus an overhang; valid cuts require the relevant recognition/overhang region to be double stranded. This gives it a substantially better starting point than plain sequence slicing. [Dseq API](https://pydna-group.github.io/pydna/modules/pydna_dseq.html)

Proposed action semantics, to confirm:

1. Resolve exact input sequence and enzyme revisions; validate the complete row before calculation.
2. Predict a complete digest at supported canonical sites on double-stranded DNA. Search the circular boundary where relevant; preserve both strand boundaries and the enzyme responsible for each event.
3. Combine supported enzymes in one prediction. Deduplicate identical physical break pairs while retaining all enzyme attribution. Reject overlapping/conflicting cleavage configurations until their semantics are implemented.
4. Return explicit `no cuts` when none occur, retaining the unchanged molecule/topology in the prediction. Do not mistake pydna's empty return for destruction of the molecule. Proposed default: create no duplicate entity for this case.
5. Order linear products by source reference coordinates. For circular products, choose and display a deterministic origin rule; propose starting after the lowest reference-strand cut. Never sort by length as the authoritative order.
6. Preserve both physical strands and left/right end geometry in each proposed product. One cut opens a circle into a linear product. Under distinct, compatible complete breaks, k cuts give k+1 linear-input fragments or k circular-input fragments when k is positive. Treat these as validation invariants only within that supported model.
7. Present proposed products before registration; persist source revision, enzyme revisions, algorithm/version, parameters, source intervals and prediction identity with selected registered outputs. Re-running or retrying registration must not silently create duplicates.

Sticky-end fragment lengths require care: the reference-strand partition, duplex span, paired region and individual strand lengths can differ. Do not claim that every displayed product length is bp or that summed duplex spans must equal the input length. Verify strandwise sequence conservation and explicit end geometry instead.

## Annotation propagation

pydna offers `Dseqrecord` as a record wrapper and documents cutting with retained sequence features. Library behavior is a candidate mechanism, not a substitute for a product policy. [Dseqrecord API](https://pydna-group.github.io/pydna/modules/pydna_dseqrecord.html)

Proposed policy: rebase wholly retained annotations onto output coordinates and preserve source-feature IDs. Explicitly mark clipped/split annotations as partial, including the source interval and retained parts. Do not label a cut CDS or protein-coding region as an intact functional feature. If a feature crosses a circular origin, reconstruct its ordered parts before intersection with product intervals. UI selection coordinates and propagation must share one tested mapping. Feature propagation onto overhang-only segments needs an explicit convention in the data-model decision.

## Prediction is not laboratory success

Supplier documentation explains that nonstandard reaction conditions can create off-target star activity; canonical motif matching does not simulate this. [NEB star activity](https://www.neb.com/en-gb/faqs/what-is-star-activity-and-how-can-it-be-avoided)

Methylation can block or enable particular enzymes, while incomplete digestion can yield mixed populations rather than the complete-digest products. [Merck methylation guidance](https://www.merckmillipore.com/SL/en/technical-documents/technical-article/genomics/sequencing/restriction-enzymes), [Thermo Fisher digestion guidance](https://www.thermofisher.com/cl/en/home/life-science/cloning/cloning-learning-center/invitrogen-school-of-molecular-biology/molecular-cloning/restriction-enzymes/restriction-enzyme-key-considerations.html)

Proposed demo label: “Predicted complete digest; canonical sites; methylation and reaction conditions not modeled.” Keep measured Results as separate records attached through the platform, so registering predicted products never asserts that a physical experiment succeeded.

## Selection statistics

For definite nucleotides, GC percentage is `100 * (G+C)/length`. Biopython exposes distinct removal, denominator-including and weighted ambiguity policies, producing different answers on ambiguous input. Its empty-sequence GC result is zero. [GC API](https://biopython.org/docs/latest/api/Bio.SeqUtils.html)

Proposal: show count and GC for unambiguous DNA/RNA selections; empty selection is unavailable, not 0%. For ambiguous selections show ambiguity count and either suppress GC or explicitly name the chosen estimate/denominator. No GC percentage for protein.

Melting temperature depends on the duplex and model. Biopython provides Wallace, empirical GC and nearest-neighbor methods with different applicability and parameters. Nearest-neighbor estimates depend on thermodynamic tables, concentrations, salts, mismatches and dangling ends; the library does not automatically infer self-complementarity or align the target. [MeltingTemp API](https://biopython.org/docs/latest/api/Bio.SeqUtils.MeltingTemp.html)

Proposal: defer Tm unless the user chooses an explicit oligonucleotide workflow. If included, expose the duplex type, model/table, strand concentrations and units, ionic conditions, self-complementarity and mismatch assumptions. Label it an estimated duplex Tm; do not present it as the melting point of any arbitrary sequence selection or as a PCR annealing-temperature recommendation.

## Libraries and redistribution

| Candidate | Evidence-backed fit | Limitation / proposed role |
|---|---|---|
| Biopython | Sequence utilities, features, restriction discovery, GC/Tm | Good baseline utility dependency; plain `Seq` fragments do not encode a complete sticky-ended duplex contract |
| pydna | Double-stranded molecule and cloning/digest simulation abstractions | Evaluate for digest products behind a Mod-owned adapter; published docs inspected identify a development version, so select a supported release and verify semantics |
| Hand-written motif/slice engine | Small dependency footprint | Own proposal only; requires owning strand/origin/end/overlap correctness, so not recommended as the scientific reference |

Biopython's default license permits use and redistribution subject to notices; some files offer BSD-3-Clause as an alternative. Do not describe the entire distribution as uniformly BSD without checking file headers. [Biopython license](https://github.com/biopython/biopython/blob/master/LICENSE.rst)

pydna's license permits source/binary redistribution with notice, disclaimer and non-endorsement conditions. Include dependency notices in distribution artifacts. [pydna license](https://raw.githubusercontent.com/pydna-group/pydna/master/LICENSE.txt)

The inspected Biopython restriction dictionary declares itself governed by the distribution license and records REBASE EMBOSS version 404 (2024). It is a versioned snapshot, not proof of current enzyme availability or conditions. [Dictionary source](https://raw.githubusercontent.com/biopython/biopython/master/Bio/Restriction/Restriction_Dictionary.py)

Direct REBASE licensing could not be verified: its site was unavailable through the research browser. NEB's general website terms restrict copying beyond stated uses; public availability alone is not an import/redistribution license. [NEB terms](https://www.neb.com/terms-of-use) Recommendation: use the dependency's explicitly licensed bundled data with retained attribution/version for evaluation; do not scrape or promise a redistributable live supplier/REBASE catalog. Resolve source-specific terms before any separate catalog distribution. This is a documented evidence gap, not a claim that a particular REBASE license forbids the intended use.

## Bounded demo proposal and outstanding human decisions

Propose definite A/C/G/T duplex DNA for executable digestion, including linear and circular inputs; retain all three molecular entity types and manually annotated features. Start with a small sourced enzyme set covering blunt and staggered cuts, including multiple-enzyme and no-cut demonstrations. Represent other accepted sequence alphabets faithfully but disable unsupported computations explicitly. Defer arbitrary custom enzyme execution, nickases, two-break enzymes, modified/methylated substrates, partial digestion, overlapping cut conflicts and uncertain input digestion until separately specified. This is a recommended boundary, not a scope change already agreed.

The existing data-model and action decision tickets should settle: accepted ambiguity/stop/gap symbols; duplex and fragment-length contract; feature clipping; permitted enzyme classes and custom definitions; no-cut registration; circular product naming/order; and whether Tm earns its complexity. The prototypes should expose these states rather than assume acceptance. Catalog redistribution needs a sharp follow-up only if a separate downloaded catalog is selected.

Implementation verification should include first/last-base coordinate conversions; reverse complement twice; origin-spanning sites/features; linear versus circular zero/one/multiple cuts; blunt and both sticky-end polarities; duplicated enzyme attribution; enzyme-order independence; overlapping/out-of-bounds failures; partial annotations; ambiguous/empty input; and retry-safe registration. Use independent expected strand diagrams for fixtures, not only agreement between libraries sharing Biopython dependencies.
