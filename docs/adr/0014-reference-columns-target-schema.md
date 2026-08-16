# ADR-0014: Reference Columns Target a Schema — Mirroring the Dropdown Precedent

> Date: 2026-08-03
> Status: Accepted
> Companion spec: [Spec: Settings layout kit, schema reference columns, and relationship map](https://github.com/TimHoogervorst/Helix/issues/389)
> Related: [ADR-0010](0010-column-type-registry.md) (column type registry)

---

## Context

Per ADR-0010, the column type registry supports a `reference` column type — a column whose value points at another entity. However, reference columns cannot declare *which schema* they point at. A column can say "this references an entity" but not "this references a Cell Line," so schema-to-schema relationships are invisible in the data model and no relationship map can be drawn.

Dropdown columns already carry a `dropdownId` that constrains their values to options defined by a specific dropdown. Reference columns have no equivalent targeting mechanism — they are an open pointer to any entity in the system.

Three approaches were considered:

| Approach | Target | Validation | Relationship map |
|---|---|---|---|
| **Target Schema** (chosen) | Concrete Schema (e.g. "HEK293 Cell Line") | Server validates entity matches target schema | Concrete edges per reference column |
| **Target Schema Type** (rejected) | Schema Type (e.g. "Cell Line") | Server validates entity matches target schema type | One edge per schema type, ambiguous |
| **No target** (status quo) | Any entity | Any entity accepted | No edges possible |

---

## Decision

**Reference columns gain an optional `referenceSchemaId` field, mirroring how dropdown columns carry `dropdownId`. The stored target is a concrete Schema, not a Schema Type. The server validates that reference values point at entities of the target schema.**

### Column definition shape

```typescript
interface ColumnDef {
  name: string;
  type: ColumnType;            // includes "reference" per ADR-0010
  dropdownId?: number;         // existing precedent
  referenceSchemaId?: number;  // NEW — target Schema for reference columns
  required?: boolean;
  default?: string;
  units?: string;
  description?: string;
}
```

The shape change is minimal — one new optional field, mirroring the existing `dropdownId` precedent. No other fields change.

### Why Schema, not Schema Type

The stored target is a **Schema** (the concrete structure — e.g. "HEK293 Cell Line"), not a **Schema Type** (the category — e.g. "Cell Line"). This yields concrete, validatable edges for the relationship map: each reference column draws one edge from the owning schema to the target schema. A Schema Type target would produce ambiguous edges (which schema of that type?) and weaker validation (entities of the type, but maybe not the right schema).

The reference-column picker in the UI groups schemas by Schema Type for findability — the user navigates "Cell Line → HEK293" — but the stored value is always the concrete schema ID.

### Server validation

The server validates reference values at write time: an entity property stored in a reference column must identify an entity whose `schema_id` matches `referenceSchemaId`. Validation lives in the existing column type registry machinery (ADR-0010) — the `reference` type already exists; this adds its target constraint.

Validation applies to both entity create and entity update. Archived or missing targets are handled with clear error messages.

### API round-tripping

The schema API round-trips `referenceSchemaId` exactly like `dropdownId` — in the column definition payload for schema GET/PUT endpoints. No new endpoints or special-case plumbing.

### Relationship map

The relationship map (ERD) shipped as part of the same PR uses `referenceSchemaId` as its sole data source. Schema cards are nodes; reference columns are edges drawn as bezier curves underneath. If edges cannot be drawn from the stored data, the model is wrong — the ERD doubles as validation of the data model decision.

---

## Rationale

### Why mirror `dropdownId`

Dropdown columns already carry a `dropdownId` that constrains their values. Reference columns need the same pattern: an optional foreign key to a target definition. The shape, the API handling, and the server validation follow the same precedent. No new patterns to learn.

### Why Schema, not Schema Type

A Schema Type target would mean a "Cell Line" reference column accepts any entity whose Schema Type is "Cell Line" — but the lab likely has multiple Cell Line schemas (e.g. "HEK293", "HeLa", "Jurkat") and intends the reference to point at one of them. A concrete Schema target makes the relationship precise: this column points at HEK293 entities specifically. It also makes the relationship map drawable — one edge per column, with concrete source and target nodes.

### Why server-side validation

The column type registry already validates typed column values on entity create/update. Adding a target constraint check to the `reference` type handler is a natural extension. Server-side validation ensures that references are correct regardless of client — CLI imports, API consumers, and future clients all get the same guarantee.

### Why optional

Not every reference column needs a target. A generic "Related Entity" column that can point at anything is valid — `referenceSchemaId` is `undefined` in that case. The field is optional, preserving the existing open-reference behavior while enabling targeted references where needed.

---

## Consequences

### Benefits

- **Explicit schema relationships.** The data model records which schemas reference which other schemas. Previously invisible connections become queryable.
- **Relationship map.** A visual ERD showing schema nodes and reference edges is drawable directly from the stored data. No inference or heuristics needed.
- **Server-guaranteed referential integrity.** Bad links are rejected at write time regardless of client.
- **Minimal API surface change.** One new field on column definitions. No new endpoints, no special-case handling.
- **Pattern consistency.** Reference targeting works the same way dropdown targeting does — same shape, same API treatment, same validation pattern.

### Constraints

- **Existing reference columns gain no target.** Existing columns default to `referenceSchemaId: undefined` — they continue to accept any entity. Only newly configured or explicitly edited columns gain targets.
- **Server migration.** The `columns` JSON field on existing schemas must tolerate the new optional key. Since JSON Schema columns are stored as flexible JSON, no database migration is needed.
- **Frontend picker.** The column editor needs a schema picker grouped by Schema Type — a new UI component. The picker must handle the case where no target is selected (generic reference).

### Future considerations

- **Cascading validation.** If Schema A references Schema B, and Schema B is archived or deleted, the system must decide whether to cascade-null the reference, block the archive, or warn. This is deferred to a future schema-lifecycle spec.
- **Multi-target references.** A future column type could target multiple schemas or schema types. The `referenceSchemaId` field is deliberately singular — `referenceSchemaIds: number[]` would be a new column type, not an extension of this one.
- **Relationship map interactivity.** The initial ERD is a static SVG. Pan, zoom, drag, and auto-layout are deferred. The `referenceSchemaId` data model supports interactive features when they are prioritized.

---

## Amendment: Schema type reference targets

> Origin: [Spec: Table Kit — typed cells, Formula Columns, and Result Tables #492](https://github.com/TimHoogervorst/Helix/issues/492)

### Context

Some reference columns need to accept entities from any concrete schema under a schema type rather than one specific schema. The original decision that concrete `referenceSchemaId` targets produce precise relationship-map edges remains valid for columns that need a singular target.

### Decision

Extend the column definition with an optional type-level target:

```typescript
referenceSchemaTypeId?: number;
```

`referenceSchemaId` and `referenceSchemaTypeId` are mutually exclusive. `referenceSchemaId` remains the concrete-schema target; `referenceSchemaTypeId` permits any concrete schema under the selected schema type. The backend validates this constraint at write and registration time. Existing columns with neither field remain unrestricted.

Concrete targets continue to produce concrete relationship-map edges. Type-targeted columns produce no concrete relationship-map edge because their target is not singular.

### Consequences

- Reference columns can express both precise schema targets and broader schema-type targets without changing the existing reference column type.
- The backend prevents ambiguous definitions that specify both target forms.
- Relationship maps remain precise: only `referenceSchemaId` creates a concrete edge; type-level targeting is intentionally not represented as a concrete edge.
- This amendment extends the original schema-only targeting decision without discarding its concrete-target behavior.
