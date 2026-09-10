# ADR 0026: Source Replaces Containment

## Status

Accepted — 2026-08-27. Supersedes [ADR 0005](0005-entry-status-cascade.md) (entry-only cascade).

## Context

Containment was expressed by three parallel mechanisms: a `folder` FK on every entry and entity, a `source_entry` FK on entities registered in an entry, and a soft display-ID reference in result properties (`properties["Entity"]`) linking results to their source entities. Entries and entities were forced to live in a Folder (or at the project root), so the Library could only list Folders and Entries, the status cascade was hardcoded to one level (entry → its registered entities), and results were tied to their source entity informally. Three separate answers to "where does this thing live" could drift apart.

## Decision

**Replace all containment with a single required polymorphic Source reference on every Folder, Notebook Entry, and Entity.** A Source may be a Project, Folder, Notebook Entry, or Entity. Projects are the only roots and carry no Source.

- Source is required and never null; the default is the Project ("lives at root").
- Folders are restricted to Folder | Project sources. Entries and entities are unrestricted at the API; the UI offers fewer combinations.
- Guardrails, enforced server-side: no self-source, no cycles, and a Source must resolve within the same Project.
- The `project` column stays as a system-maintained denormalization — access is project-based and must not require chain walks.
- Every sourced item carries a **Source Path**: ordered `{kind, id}` ancestor segments from the Project down to the direct Source, ids only, names hydrated at read time, maintained synchronously on every create and move. Backend-only — never rendered as a hub column.
- A status change on any item cascades to its entire Source subtree: transitive, synchronous write-through, strictly downward, overwriting.
- Deleting any item cascade-deletes its entire Source subtree.
- One generic "children of X" endpoint (with optional recursion) replaces the library contents endpoint.

## Alternatives Considered

### Keep folder FK + source_entry and add tree rendering on top

Rejected: two parallel containment truths would remain, results would stay loosely coupled, and the Library would stay folder-only.

### Derive project membership from the chain at read time

Rejected: access evaluation checks project membership constantly; walking chains on every check is the wrong trade. The denormalized `project` column and Source Path make reads O(1).

### Async Source Path maintenance

Rejected: breadcrumbs, tree rendering, and access checks would be stale immediately after a move — exactly when the user is looking. Moves are rare; synchronous recomputation is cheap.

## Consequences

- No backfill migration — pre-production data is wiped before implementation.
- A move costs O(subtree): one prefix-swap update over descendants whose path contains the moved item. Realistic subtrees are small and moves are rare, so this is acceptable.
- Archive is a later PR and inherits the subtree semantics: archiving or restoring a node acts on its whole Source subtree.
- The `folder` and `source_entry` FKs are removed from entries and entities. The Entity Column remains user-filled result data; the Result Table additionally sets the result's Source from it — stored separately, expected to agree in the UI.
