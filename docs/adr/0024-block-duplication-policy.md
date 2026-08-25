# Block Duplication Is Policy-Driven

The Block Action Menu's Duplicate action copies a block according to the block's **Duplication Policy** rather than copying serialized state blindly. The default policy is a full copy, but a block can declare a `preserve` list naming what survives duplication; everything else is re-derived fresh, exactly as at a fresh insertion. Registry Tables and Result Tables preserve only the schema ID — a duplicate is a fresh table: current schema snapshot, default empty rows, no row data, no registration status. Protocol Blocks preserve only the protocol ID — a duplicate re-snapshots the current protocol definition and starts with empty step states. Plain Tables and Comments copy fully, content included.

Copying a Registry Table verbatim would clone its registered Display IDs into the new block — two blocks pointing at the same entities, where pressing register on the copy silently updates existing data. In a CFR Part 11 system that is an aliasing trap, so registered data never travels on Duplicate. Likewise, a duplicated protocol is a fresh performance of the procedure, not a clone of another run's completion history.

## Considered Options

- **Full copy for every block.** Rejected: the entity-aliasing trap above, and duplicated step-completion state would misrepresent a fresh protocol run.
- **Forbid Duplicate on tables that contain registered rows.** Rejected: the common case — a fresh table on the same schema — is exactly what users want, and a blanket ban would punish it.
- **Declarative `preserve` list** (chosen). Covers every current block. A free-form `duplicate(state)` hook is the escape hatch if a block ever needs logic a list cannot express.
