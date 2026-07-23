# ADR-0002: Display ID System with Prefix-Based Routing

> Date: 2026-06-25
> Status: Accepted

---

## Context

The system needs to identify and cross-reference entities across the ELN and LIMS domains. ELN entries have narrative content with inline references (`#E1`, `#BLOOD1`) and structured reference nodes embedded in TipTap JSON. LIMS entities need stable, human-readable identifiers for lab use (labels on tubes, notebook references). Both need to be:

- **Human-readable** in lab contexts (spoken aloud, written on labels, typed into notes)
- **Machine-resolvable** by the reference system without manual registry updates
- **Auto-generated** to avoid collisions and manual ID management
- **Prefix-routable** so the system knows which model to query from the ID alone

Three approaches were evaluated:

| Approach | Human-readable | Auto-resolvable | Extensible | Collision risk |
|----------|---------------|-----------------|------------|----------------|
| **Integer PKs only** | No (opaque numbers) | No (no model hint) | N/A | Low |
| **UUIDs** | No (unguessable, long) | No | N/A | Very low |
| **Prefix + sequence** (chosen) | Yes | Yes (prefix → model map) | Yes (dynamic from DB) | Low (per-prefix sequence) |

---

## Decision

**Use auto-generated display IDs with a letter prefix + integer sequence, and route references by dynamically building a prefix→model map.**

Each display ID follows the pattern `<PREFIX><N>` where:

- **ELN entries**: prefix `E`, sequential — `E1`, `E2`, `E3`, ...
- **LIMS entities**: prefix from the entity's `EntityType.prefix` field — `BLOOD1`, `DNA2`, `CHEM3`, ...

The prefix→model map has two layers:

1. **Static map** in `references/services.py` — hardcoded for core models (`E` → `NotebookEntry`)
2. **Dynamic map** loaded at call time — queries `EntityType.objects.values_list("prefix", flat=True)` and maps each prefix to the `Entity` model

```python
# Static
PREFIX_MAP = {"E": NotebookEntry}

# Dynamic (built on each resolve/search call)
for prefix in EntityType.objects.values_list("prefix", flat=True):
    PREFIX_MAP[prefix] = Entity
```

The `resolve_display_id("BLOOD1")` function:
1. Extracts the leading letters (`"BLOOD"`)
2. Looks up `PREFIX_MAP["BLOOD"]` → `Entity`
3. Queries `Entity.objects.get(display_id="BLOOD1")`
4. Returns `(instance, ContentType)`

---

## Rationale

### Why not integer PKs

- **No model hint.** `GET /api/resolve/42` — is 42 an ELN entry, an entity, or something else? Requires N queries (one per model) or a central registry table.
- **Poor UX.** Lab members don't say "entry forty-two" — they say "E42." The prefix gives immediate context.
- **Leaks sequential creation order** across all entities, which is meaningless. Per-prefix sequences are meaningful (the 5th DNA sample, the 12th blood sample).

### Why not UUIDs

- **Unreadable.** `550e8400-e29b-41d4-a716-446655440000` cannot be spoken aloud, written on a tube label, or typed into a notebook without error.
- **No model hint.** Same N-queries problem as integer PKs.
- **Overkill for collision prevention.** Single-database, single-writer (Django ORM) — we don't need distributed uniqueness. Integer sequences per prefix provide sufficient collision avoidance.

### Why dynamic prefix registration

The static `PREFIX_MAP` cannot know about entity types created at runtime. When a lab admin creates a new `EntityType` with `prefix="PLASMID"`, the reference system must resolve `PLASMID1` immediately — **without a code change or server restart**.

The dynamic approach queries the `EntityType` table on each resolve/search call. This is a single `values_list("prefix", flat=True)` query — one index scan, cached by PostgreSQL in memory after the first call. The cost is negligible (sub-millisecond) and eliminates an entire class of "I added an entity type but references don't work" bugs.

The search endpoint (`/api/references/search/?q=E1`) uses `istartswith` which benefits from the database index on `display_id`. No full-text index needed.

### Why per-prefix sequences

Display IDs are generated in `NotebookEntry.save()` and `Entity.save()`:

```python
# Find the highest existing number for this prefix
last = Model.objects \
    .filter(display_id__startswith=prefix) \
    .annotate(id_len=Length("display_id")) \
    .order_by("-id_len", "-display_id") \
    .values_list("display_id", flat=True) \
    .first()
next_num = int(last[len(prefix):]) + 1 if last else 1
```

The `Length` annotation + `-id_len` ordering handles the string-sorting problem: without it, `E9 > E10` lexicographically. Sorting by length first (`E9` < `E10` because len=2 < len=3) then descending gives correct numeric order.

This is a **gap-tolerant** sequence — deleted `E5` is not reclaimed. This is deliberate: reusing IDs would create ambiguity in historical notebook references ("does #E5 mean the current E5 or the deleted one?").

---

## Consequences

### Current benefits

- **Single-query resolution.** `resolve_display_id` is one `model.objects.get(display_id=id)` — no UNION, no multi-table scan.
- **Zero-config entity type registration.** Adding an `EntityType` row automatically enables reference resolution for its prefix.
- **Frontend reference suggestions.** `/api/references/search/?q=BL` returns `BLOOD1, BLOOD2, ...` — the autocomplete for `#` references and inline reference nodes.
- **Batch resolve.** `/api/references/resolve/` accepts `["E1", "BLOOD1", "DNA3"]` and returns resolved details in one round-trip — the frontend renders reference badges without N+1 API calls.

### Constraints

- **Prefixes must be unique.** Two `EntityType` rows with `prefix="DNA"` would cause ambiguous routing. The `prefix` field has a `unique=True` constraint. Changing a prefix after entities exist would orphan references — the UI should warn or block this.
- **Prefix must be uppercase letters.** The `resolve_display_id` function extracts leading `isalpha()` characters and uppercases them. Prefixes like `"DNA-1"` or `"type1"` would route incorrectly. The `EntityType.prefix` field help text says "Uppercase letters" — validation should enforce this at the serializer level.
- **Per-prefix sequence has a theoretical collision at 10^N.** In practice, a lab won't create 10,000 blood samples with prefix `BLOOD`. If they do, the display_id field is `max_length=50` — plenty of room.
- **Gap-tolerant sequences mean IDs are non-contiguous.** `E1, E50` is normal. Don't rely on contiguity for anything.

### Future considerations

- **Cross-database resolution.** If LIMS entities move to a separate service, the prefix→model map would need to route to API calls instead of ORM queries. The `resolve_display_id` interface (`display_id → instance`) is abstract enough to support this.
- **Custom prefix validation.** An `EntityTypeSerializer` should validate that `prefix` is `^[A-Z]+$` and warn on edit if entities already exist with the old prefix.
- **Display ID in export.** When exporting data, display IDs should be preserved as the canonical external identifier.

---

## Rejected Alternatives

- **Central registry table (Polymorphic ID).** A `ReferenceableObject` table with `display_id` and `content_type` columns, queried first on every resolution. Adds a JOIN to every reference lookup and a write to every entity/entry creation. The prefix-routing approach achieves the same result with zero additional writes.
- **URL-based references** (`/eln/entries/42` stored in content). Tightly couples content to URL structure. If the API URL scheme changes, every stored reference breaks. Display IDs are URL-independent.
- **Full-text search only.** Rely on PostgreSQL full-text search to find `#E1` in content. Breaks on partial matches (`E1` inside `BE12`), can't distinguish `#E1` the reference from `E1` the casual mention, and can't validate that the target exists.
