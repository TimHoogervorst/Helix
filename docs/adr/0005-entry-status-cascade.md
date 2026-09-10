# ADR 0005: Entry Status Cascades to Source Entities

## Status

Accepted — 2026-07-02. **Superseded by [ADR 0026](0026-source-replaces-containment.md)** (2026-08-27): the cascade is generalized from `source_entry` to the entire Source subtree.

## Context

The Notebook Entry gains a `status` field with two values: `in_progress` and `finished`. When a user marks an entry as "Finished," the intent is that everything *produced in* that entry is also finished. Entities (lab samples, reagents, etc.) can be created from LIMS tables embedded in the entry's TipTap content — these entities have a `source_entry` FK pointing back to the Notebook Entry that created them.

The question: when an entry's status changes, should any entities also change status? And if so, which ones?

## Decision

**When a Notebook Entry's `status` field changes, the new status is written to every Entity whose `source_entry` is that Notebook Entry.**

Specifically:

- Only entities with `Entity.source_entry = <this entry>` are affected (the entry is the *origin* of the entity — it was created here via a LIMS table)
- Entities that are merely **referenced** (via Mentions, `@` links, or `reference` nodes in the TipTap content) are **not** affected — they have their own independent lifecycle
- The cascade is a **write-through**: `Entity.status` is a persisted field, updated synchronously when the entry is saved. It is not derived at read time.
- The cascade is **one-way**: changing an entity's status does not affect the entry

The discriminator is `source_entry` — "did this entity come into existence because of this entry?" — not "is this entity mentioned in this entry?"

## Alternatives Considered

### Blind cascade to all linked entities

Cascade to every entity connected to the entry — via `source_entry`, Mention, or LIMS table reference. **Rejected** because an entity may be referenced by many entries; one entry's completion shouldn't force that entity's status. An entity is an independent thing with its own lifecycle.

### Read-only derived status

Don't persist `Entity.status` at all — derive it at read time from the source entry. **Rejected** because entities can exist without a source entry (created manually in LIMS), and because read-time derivation makes filtering/querying by entity status expensive.

### No cascade at all

Keep entry status and entity status completely independent. **Rejected** because it breaks the user's mental model: "I finished this experiment, so the samples I created in it are ready." Requiring users to manually update each entity's status after finishing an entry is friction the system should eliminate.

## Consequences

- `Entity` model gains a `status` field (CharField, choices matching NotebookEntry.status)
- `NotebookEntry.save()` (or a signal handler) must cascade status changes to `Entity.objects.filter(source_entry=self)`
- If an entity is later *re-used* in a new entry (via a LIMS table reference), its status is not affected by the new entry — its status only changes when its *origin* entry changes. This could surprise users who expect "I used this sample again, so it should be back in progress." This is a known limitation; a future PRD may add manual entity status override.
- The cascade is a synchronous database write. If an entry has thousands of source entities, this could be slow. In practice, entries create single-digit numbers of entities via LIMS tables — this is a non-issue for the current scale.

## Related

- [ADR 0001: TipTap JSON Content Format](0001-tiptap-json-content-format.md)
- [ADR 0002: Display ID Prefix Routing](0002-display-id-prefix-routing.md)
- Parent EPIC: [#55 — Helix UI Redesign](https://github.com/TimHoogervorst/OpenScience/issues/55)
- This EPIC: [#67 — ELN Entry Polish](https://github.com/TimHoogervorst/OpenScience/issues/67)
