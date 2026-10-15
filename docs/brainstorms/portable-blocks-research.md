# Portable blocks: research and robust design option

Date: 2026-10-15

Status: research with an accepted design direction recorded below; not an implementation specification.

Planning map: [Explore standalone Mods over durable scientific data](https://github.com/TimHoogervorst/Helix/issues/681). Remaining decisions are tracked as its child issues.

Question: should Helix divide blocks into blocks with Actions and blocks without Actions, and how can either preserve useful scientific content after a mod disappears?

## Context and scope

The discussion establishes platform-owned Durable Records, retained exact Data Contract Versions, generic inspection and JSON export, conditional editing, and Historical Renditions of reviewed or signed Revisions. A Renderer must not change supplied Recorded Values or silently recalculate recorded scientific results. A Block may initiate an Action. These are target requirements, not claims that the current implementation already satisfies them; see [CONTEXT.md](../../CONTEXT.md#durable-scientific-data).

This note investigates editor and command architecture precedents. It does not assess regulatory compliance. None of the APIs below establishes scientific preservation, authorization, auditing, or Part 11 compliance for Helix.

Local inspection during this exploration found that [createBlockNode.tsx](../../src/shell/src/workspace/TipTapRenderer/createBlockNode.tsx) uses binding identifiers as node names and delegates payload serialization to block implementations. [RegistryTableNode.tsx](../../src/bundled/lims/blocks/RegistryTableNode.tsx) performs registration through an HTTP call, then updates document attributes and emits an event. These are concrete migration seams; a documentation-level rule that blocks do not use HTTP is not enough to describe actual behavior.

An execution request, a notification that an operation completed, and an audit entry have different roles. The current registration handler demonstrates that emitting `entities-registered` is not what executes registration. Any new Action interface must connect to authoritative execution and persistence rather than treat the existing notification or logging catalog as an execution engine.

## Findings from primary sources

### Jupyter separates persisted outputs from their presentation

The notebook format represents rich outputs using MIME-keyed bundles, allowing JSON, plain text and images in the same output. Execution results are stored as outputs. Its compatibility rules say unrecognized new cell or output types are preserved even when they cannot be rendered. [Jupyter notebook format](https://nbformat.readthedocs.io/en/latest/format_description.html#code-cell-outputs), [compatibility rules](https://nbformat.readthedocs.io/en/latest/format_description.html#backward-compatible-changes).

**Inference for Helix:** preserve structured content independently of its specialized viewer. Optional readable representations can accompany it. Preserving unknown bytes is a useful minimum, but Helix needs a stronger generic inspection guarantee than merely retaining an unrenderable cell.

**Limit:** MIME identifiers do not themselves provide exact scientific contract versions, retained definitions, immutable provenance, or revision-pinned relationships. A text/image representation cannot silently become the authoritative scientific value.

### JupyterLab registers commands independently of their UI placement

JupyterLab commands have identifiers, execution functions and presentation metadata. They can declare visibility and enablement, and registered commands can be placed in multiple UI locations, including notebook toolbars and menus. [JupyterLab command registry](https://jupyterlab.readthedocs.io/en/stable/extension/extension_points.html#add-a-command-to-the-command-registry).

**Inference for Helix:** registration or DNA cutting need not be behavior embedded in one block component. A separately registered Action can be offered from an ELN block, an entity page or another appropriate surface. UI availability and backend execution remain separate responsibilities.

### VS Code separates document models and editor views

VS Code's custom editor model separates a document from its editor views; several editor instances can share one CustomDocument. Read-only custom editors may still be interactive. Writable custom editors require additional editing and persistence behavior. For custom binary documents, the extension implements the document model and operations such as saving and backup. [VS Code Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors#customdocument), [read-only editors](https://code.visualstudio.com/api/extension-guides/custom-editors#readonly-custom-editors).

**Inference for Helix:** interaction does not imply mutation. A sequence viewer can support selection, zoom and navigation without permission to alter scientific values. Separate Viewer and Editor interfaces could make this boundary explicit.

**Limit:** Helix should not copy extension-owned authoritative persistence from the custom binary document example. That would recreate the uninstall dependency this design is intended to remove.

### VS Code distinguishes command placement, visibility and enablement

VS Code registers commands separately from their menu contributions. Menu `when` conditions control visibility, while command `enablement` affects menus and registered keybindings. Invocation arguments depend on the calling surface; menu context may identify a different resource from the active editor. [VS Code commands](https://code.visualstudio.com/api/extension-guides/command).

**Inference for Helix:** an Action binding should explicitly carry its target record and revision, rather than infer the target from the containing ELN entry. A context predicate can explain unavailable actions in the UI. It must not replace backend permission, revision or contract validation.

### Tiptap already separates interactive views from exported HTML

Tiptap Node Views can provide interactive UI in editable or read-only editors. Its documentation explicitly separates those views from HTML serialization; exporting a document does not export its rendered JavaScript Node View. [Tiptap Node Views](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views).

**Inference for Helix:** specialized UI and durable content should have separate interfaces. Introduce a platform-owned document node envelope holding exact contract bindings and preserved payloads, so loading and saving without a mod does not depend on that mod's serializer. An unavailable placeholder alone does not establish lossless load/save behavior.

## Design families to compare

| Family | Mechanics | Advantage | Main cost |
|---|---|---|---|
| Hard split | Persist or register distinct ViewBlock and ActionBlock kinds | Simple author expectations; easy to offer a visibly restricted presentation type | A result with optional actions straddles both kinds; provider removal must not destroy its identity |
| Lean composition | One saved block with a viewer and optional locally bound tools | Small change; preserves current workflows | Tools remain coupled to block implementations, making cross-mod reuse harder |
| Robust composition | One saved block; separately registered compatible viewers, editors and Actions | Data and capabilities evolve independently; reuse across surfaces | More matching, interfaces and diagnostics |
| External workflow | Document placements only present records; scientific actions run in dedicated workspaces | Clear document/method boundary | Context switching; Registry Table's convenient inline registration changes substantially |

## Robust option: durable content with composed capabilities

**Proposal:** retain one durable Block Instance concept and compose independently registered Viewers, Editors and Actions around it. “Has actions” becomes a capability of the current view, not a permanent storage category.

| Responsibility | Proposed owner | Survives removal of contributing mod? |
|---|---|---|
| Block identity, document position and saved content | Platform document storage | Yes |
| Content structure and semantic definitions | Retained Data Contract Versions | Yes |
| Referenced entity values and method results | Platform Durable Records and Revisions | Yes |
| Generic content inspection and JSON export | Platform | Yes |
| Specialized Viewer | Installed mod capability | Only if a compatible provider remains |
| Specialized Editor | Installed mod capability | Only if supported validation remains |
| Scientific Action implementation | Installed mod capability | Only if a compatible provider remains |
| Historical Rendition | Retained record artifact | Yes |

These ownership choices are recommendations, not decisions recorded by this research.

### Mechanics

1. Store a Block Instance with a stable identity and contract-bound content. Persist either embedded Typed Values, explicit references, or a declared combination. Pin scientific historical references to the appropriate Revision.
2. Bind nested specialized values to their own exact contracts. A flat list of contracts associated with the block is insufficient to identify which value each definition describes.
3. Resolve a Viewer compatible with the persisted contract version. If none exists, use the platform fallback. Installing a viewer does not migrate the stored value.
4. Resolve an Editor separately. Generic editing is available only where retained definitions provide sufficient validation; other content remains inspectable.
5. Offer separately registered Actions using explicit inputs, targets and applicability. The block is an initiating surface; the Action owns the scientific operation.
6. Commit Action results through platform services with audit and provenance. A viewing lifecycle must not create scientific results as a side effect.
7. Keep current specialized presentation distinct from a retained Historical Rendition. The latter is not regenerated through whichever Viewer happens to be installed.

An illustrative composition, not a proposed API:

```text
Block Instance
  content: MethodExecution contract @ exact version
  references: input revision, output records, attachments
  presentation: compatible Viewer or platform fallback
  editing: compatible Editor, where permitted
  actions: available capabilities for explicit targets
```

### Registry Table example

The table retains column definitions, row values, registration status and references to created entities through its saved-content definition. Sequence cells carry sequence contract bindings. Editing draft row inputs and registering entities are different operations.

The Register Action receives the rows and intended target schema explicitly. Its Recorded Values belong to the created entities; the ELN block records the references and appropriate outcomes. Removing the Action provider must leave the table inspectable.

### DNA cutting example

A block may first show draft input references and parameters. Its Action produces recorded results and output-entity references. A Viewer then displays those results without running the cutting algorithm again.

The result structure must distinguish a simulation from a recorded laboratory procedure. The initial scope leaves operations with Mods and does not require a universal Method Execution record. Input and output Entities use retained contracts. Mods must preserve the method context needed to interpret outputs as durable contract-defined data; they choose an appropriate structure. The precise required context and its association with outputs still need design.

### Why two permanent block kinds are insufficient

The same sequence content can be viewed by one user, edited by another, and analyzed by someone with an available method provider. Removing that provider changes the available Actions without changing the content's identity or contract.

Two UI categories, such as “View” and “Tools,” might still help users. Making those categories different persisted data models would force unnecessary conversion when an installed capability or permission changes.

### Bets, costs and failure modes

**Bet:** future mods will reuse contracts more often than they reuse complete block implementations. Explicit matching lets a replacement viewer read legacy content without needing the original mod.

**Cost:** more registration surfaces, compatibility checks and diagnostics. Authors must distinguish saved content, draft inputs, presentation settings and recorded outputs. Existing blocks need migration adapters.

**Failure mode:** a generic schema can preserve structure while omitting meaning. Contract reviews must identify units, roles, references and scientifically significant settings, rather than accept arbitrary opaque JSON as sufficient.

**Failure mode:** a Viewer advertises compatibility but changes the apparent interpretation. Exact-version declarations, representative legacy fixtures and preserved Historical Renditions help detect or contextualize this; declarations alone prove nothing.

**Failure mode:** an Action writes results successfully but the document reference update fails. Registration retries must not create duplicate entities. Transaction boundaries, durable operation identities and recovery behavior need design before implementation.

**Failure mode:** a UI-only “read-only” state is mistaken for authorization. Execution services must independently validate permissions, lock state, current revisions and inputs. Composition is an interface discipline, not a security sandbox.

## Applied recommendation and open questions

The user accepted capability composition, including explicit contributions from other mods, with this refinement: a Block presents content by default, and attached Actions enable edits or other operations. An Editor is the UI for proposing an Action's changes, not an independent mutation capability. See the canonical [Action Binding definition](../../CONTEXT.md#action-binding).

The initial scope does not mandate a platform Method Execution record: Mods implement operations over contract-defined input and output Entities. Historical scientific inputs use exact Revision references, while browsing views may explicitly follow current values; see [Record Reference](../../CONTEXT.md#record-reference). Initial interoperability uses explicitly supported contract versions; automatic mappings between different contracts are deferred.

Mods must retain the context needed to interpret outputs through contract-defined durable data, while choosing the scientific structure appropriate to their domain; see [Scientific Provenance](../../CONTEXT.md#scientific-provenance). This requirement is independent of whether a Mod elects to model an execution as its own Entity.

Start with explicit provider bindings and a stable saved envelope. Defer automatic provider ranking and any generalized workflow engine. Prototype the separation on Registry Table and a small hypothetical sequence-method block before standardizing registration APIs. These scope and implementation recommendations remain proposals.

Reuse existing platform validation and action logging where applicable, but do not equate the current action catalog/event emissions with a generic business-operation executor. Execution ownership and transaction boundaries still need explicit design. Preserve the existing distinction between loading saved content and duplicating it: duplication resets registration/protocol state under [ADR 0024](../adr/0024-block-duplication-policy.md).

Questions requiring further design:

- Is selecting a different Viewer a local preference, saved document configuration, or a revisioned change when scientifically meaningful?
- How are current-value references distinguished from exact Revision references in the UI?
- What method context must accompany output Entities, and where is it retained without requiring a universal Method Execution record?
- Which edits can generic editors validate safely when a mod is absent?
- How are pending or failed Actions reconciled with the ELN document and created records?
- What deterministic policy selects among compatible Viewers? Automatic choice must not imply data migration.
- How will existing serialized block payloads be migrated without dropping unsupported fields or relationships?

No new dependencies or implementation changes are proposed by this note.
