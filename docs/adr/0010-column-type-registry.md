# ADR-0010: Column Type Registry — Backend-Owned Typed Column Definitions

> Date: 2026-07-24
> Status: Accepted
> Companion specs: [Spec 3 — Column Type Registry](../../.claude/spec-3-column-type-registry.md), [Spec 1 — Single-Source Registration](../../.claude/spec-1-single-source-registration.md)

---

## Context

Every column in Helix — whether a system field (`display_id`, `status`, `created_at`) or a user-defined schema property (`concentration`, `source_sample`) — carries a type. Today, that type is one of five hardcoded string labels: `Text`, `Number`, `Date`, `Boolean`, `Reference`. This set is duplicated in five places across frontend and backend code. Each rendering site writes its own inline switch for icons, formatting, and editing behavior. Field filtering is exact-match only — there are no operators (`contains`, `>`, `<`, `between`), no type-aware rendering, and no extension point for domain-specific types like DNA sequences or users.

ADR-0008 established that the backend is the authoritative source for system data. ADR-0009 established that actions are registered, catalogued, and validated. Column types are the missing piece — they should be backend-registered, frontend-discovered, and extensible.

Three approaches were considered:

| Approach | Type extensions | Operators | Rendering | Validation |
|----------|----------------|-----------|-----------|------------|
| **Status quo — hardcoded string labels** | None | None (exact match only) | Inline switch per rendering site | Inline per serializer |
| **Configuration-driven (JSON/YAML)** | Static (no custom logic) | Limited (string→lookup map) | Generic (no custom rendering) | Declarative (regex, min/max) |
| **Python class registry** (chosen) | Full (subclass, override methods) | Full (Django `Lookup` subclasses) | Backend-declared metadata + operand_shape dispatch | Python `validate()` method |

---

## Decision

**Column types are proper Python classes registered into a backend-owned registry. Each type owns its identity, operators, validation, and rendering hints. Mods extend types via subclassing. The frontend discovers the type catalog at boot and renders columns generically from the metadata.**

### Column type model

A `ColumnType` is a Python class with:

- **Identity**: `id` (lowercase string, e.g. `"text"`, `"dna_sequence"`), `display_name`, `icon` (Lucide token)
- **Operators**: list of `OperatorMeta(id, label, operand_shape, django_lookup_name)` — declared by `get_operators()`, translated to SQL via Django's `Lookup` system
- **Validation**: `validate(value) → bool | str` — called on batch register, base returns `True`
- **Rendering hints**: derived from `operand_shape` — the frontend renders filter inputs and cell editors generically

**Operator translation**: For 90% of operators, the `django_lookup_name` maps directly to a built-in Django field lookup (`icontains`, `gt`, `lte`). For custom operators, mods register a Django `Lookup` subclass alongside their `ColumnType`. The query builder is a single generic function in `helix_core` — no SQL in column type classes, no Python UDFs in filter paths.

**Registration flow**: Mods call `registry.register_column_type(MyType)` in `mod.py`. `helix_core` registers the five built-in types in its `AppConfig.ready()`. The registry validates `id` uniqueness across all mods. `get_registry_payload()` adds a top-level `columnTypes` key to the boot response.

**Frontend rendering**: No frontend registration required. The `operand_shape` field (`"text"`, `"number"`, `"date"`, `"boolean"`, `"dropdown"`, `"entity-picker"`, `"range"`) maps 1:1 to generic input components. A single `renderCell` / `renderFilterInput` dispatches on shape. Custom rendering (e.g., DNA mini-viewer) is deferred as an escape hatch.

### Built-in type hierarchy

| Type ID | Extends | Operators | operand_shape |
|---|---|---|---|
| `text` | ColumnType | eq, neq, contains, starts_with, ends_with, is_empty | text |
| `number` | ColumnType | eq, neq, gt, gte, lt, lte, between | number / range |
| `date` | ColumnType | eq, neq, gt, gte, lt, lte, between | date / range |
| `datetime` | ColumnType | eq, neq, gt, gte, lt, lte, between | date / range |
| `boolean` | ColumnType | eq, neq | boolean |
| `dropdown` | ColumnType | eq, neq, in, is_empty | dropdown |
| `reference` | ColumnType | eq, neq, is_any_of, is_empty | entity-picker |
| `user` | Reference | eq, neq, is_in_group | entity-picker |

### Dropdown system

Dropdown columns reference centrally-stored dropdown definitions by `dropdownId`. Dropdowns are CRUD-able via a settings UI section and served through `GET/POST/PUT/DELETE /api/dropdowns/`. Each option's colour is derived deterministically: `hash(option_value) % palette_size`. The `status-dropdown` is pre-seeded with `["In Progress", "Finished"]`.

### System columns

`helix_core` declares a base entity column set that all entity types inherit: `display_id` (text), `name` (text), `status` (dropdown → status-dropdown), `author` (user), `created_at` (datetime), `updated_at` (datetime). Mods declare additional system columns on `register_schema_type()`. ELN adds `content` (tiptap_content).

### Migration

Column type IDs move from capitalized (`"Text"`) to lowercase (`"text"`). A one-time data migration updates the `columns` JSON field in all `SchemaType` and `Schema` rows. No backward compatibility — the database is being wiped for ELN entries and entities.

---

## Consequences

### What this enables

- **Domain-specific column types**: DNA sequence, chemical formula, user, protocol reference — any mod can register a type with custom operators and validation
- **Type-aware generic rendering**: Every rendering site (entity hub cells, registry table cells, column editor, filter bar) collapses to a single dispatch on `operand_shape` — the inline switch statements die
- **Operator-rich filtering**: The entity hub filter bar gains per-column operator dropdowns, rendered generically from the column type registry
- **Consistent icons**: One Lucide icon per type, registered once, consumed everywhere (hub table headers, column chooser, settings dropdown, filter bar)
- **Extensible validation**: `validate()` runs on batch register; future PRs will extend it to schema changes and full-dataset validation

### What this deprecates

- The five hardcoded `ALLOWED_COLUMN_TYPES` / `ALLOWED_TYPES` constants (2 backend, 1 frontend)
- Inline switch statements for cell rendering, icon selection, and type labels (~4 rendering sites)
- The `columnTypeLabel()` function and per-type header icons in `RegistryTableNode.tsx`

### Known limitations (intentional)

- **No frontend renderer registration**: All types render via operand_shape dispatch. Custom cell renderers (DNA viewer) deferred until needed.
- **No per-schema-type type constraints**: All registered column types are available in every schema's column type dropdown. If a type doesn't make sense somewhere, the user simply won't pick it. A constraint layer can be added later.
- **No full-dataset validation**: `validate()` runs on individual writes (batch register), not on schema changes that affect existing rows. Separate PR.
- **Dropdown colour hashing**: Deterministic hash-based colours mean you can't manually pick a colour for a dropdown option. This is acceptable — the hash is stable per value.

### Out of scope (explicitly deferred)

- Full-dataset validation on schema changes
- Custom frontend cell renderers per column type
- Per-schema-type column type constraints
- Hot-reloading of column types after boot
- External mod SDK column type support (the string-ID-based registration is designed to support it)
