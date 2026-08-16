# Rich Tables and Formula Support Research

**Context:** React/TypeScript LIMS/ELN platform; goals are typed cells, Excel-like formulas, and a loosely coupled table framework.

**Research date:** 2026-08-16

## Executive Summary

There are two distinct product models:

- **Database tables** (Notion, Airtable, Obsidian Bases): a column has one definition applied to every row. Computed fields reference named properties, not arbitrary cells. This produces stable schemas, predictable filtering, and easy persistence.
- **Spreadsheets** (Google Sheets, Handsontable, FortuneSheet, Univer): each cell can contain a literal or formula; formulas reference cells/ranges and require a dependency graph, recalculation, error propagation, and formula-aware editing.

For Helix, the best fit is a hybrid: keep domain tables column-typed and row-oriented, but make formula columns use a separate calculation service. Add cell-address formulas only for explicitly spreadsheet-like table types. Do not make the grid component itself own parsing or domain semantics.

## 1. Notion

### Formula language

Notion Formula 2.0 is an expression language with:

- Property references such as `prop("Name")`, arithmetic operators, comparisons, boolean operators, and ternary `condition ? a : b`.
- Function-call and method-style syntax, for example `dateBetween(prop("Due"), now(), "days")`, `prop("Tags").includes("urgent")`, and `prop("People").map(name(current))`.
- Local bindings with `let()` and `lets()`.
- Text, number, boolean, date, person, page/list, and empty values. Property types and formula result types are deliberately not identical: a relation becomes a page list, a multi-select becomes a text list, and a rollup depends on its configuration.
- Common functions across conditional, text, math, date, list, person, and relation operations: `if`, `ifs`, `empty`, `length`, `contains`, `replace`, `format`, `sum`, `mean`, `round`, `now`, `today`, `dateAdd`, `dateBetween`, `filter`, `map`, `some`, `every`, `first`, `last`, `join`, `split`, and more.

### Editor and limitations

The property editor is an autocomplete-oriented expression editor. Notion documents formula errors and recommends guarding empty values, selecting a value from relation/person lists, and using explicit empty values when branches need a stable type. The documented formula depth limit is **15 layers**, including formulas and rollups across databases. Access to referenced databases/properties is required.

### Design signal

Notion optimizes for **one formula per property**, typed return values, and named-property references. It does not expose the full arbitrary-cell spreadsheet model. Formula output is a first-class property that can be filtered, sorted, and displayed like other properties.

Sources:

- [Notion formula syntax and functions](https://www.notion.com/help/formula-syntax)
- [Notion common formula errors](https://www.notion.com/help/common-formula-errors)
- [Notion database properties](https://www.notion.com/help/database-properties)

## 2. Obsidian

### Bases

Native Bases is a database-like view over note properties. Bases defines views, filters, sorts, and displayed properties in a `.base` configuration. Its formulas are property-oriented rather than Excel-cell-oriented: expressions refer to file/page properties and built-in values, with functions for dates, durations, links, lists, and type conversion. Formula fields are computed view values; the underlying note remains the source of truth.

The important boundary is that Bases is not a general spreadsheet. It computes values for records/pages and renders them in table, list, or card views. It is therefore closer to Notion/Airtable than to Handsontable.

Sources:

- [Obsidian Bases introduction](https://help.obsidian.md/bases)
- [Obsidian Bases syntax](https://help.obsidian.md/bases/syntax)
- [Obsidian Bases functions](https://help.obsidian.md/bases/functions)

### Community plugins

- **Dataview:** indexes YAML/frontmatter and inline fields, then evaluates DQL expressions or JavaScript queries to render tables/lists. Examples include `TABLE author, date(now).year - published`. It is explicitly “about displaying, not editing”; calculations do not write back to note metadata. DQL is query/aggregation syntax, not a spreadsheet formula language.
- **Projects:** a project-management view over note metadata. Its computed behavior is view/filter-oriented and plugin-specific, not a general dependency-aware cell formula engine.
- **DB Folder:** turns folder files into a database-like table and supports metadata-oriented computed/display behavior; it is still a row/property model, not arbitrary cell references.
- **Advanced Tables:** improves Markdown table editing, alignment, navigation, and formulas commonly used in Markdown table workflows, but it is not a full recalculating spreadsheet engine.

### Design signal

Obsidian demonstrates a useful separation: an index/query layer can calculate projections without mutating source records. For a lab platform, this is valuable for read-only derived views and auditability, but it is insufficient by itself for editable calculated cells.

Sources:

- [Dataview documentation](https://blacksmithgu.github.io/obsidian-dataview/)
- [Dataview expressions](https://blacksmithgu.github.io/obsidian-dataview/reference/expressions/)
- [Obsidian community plugin registry](https://github.com/obsidianmd/obsidian-releases)

## 3. AG Grid

AG Grid is primarily a data grid, not a user-editable spreadsheet engine.

### Built-in expression support

- Column definitions may use `valueGetter`, `valueSetter`, `valueFormatter`, and `valueParser` functions or string expressions.
- Cell expressions can be enabled with `enableCellExpressions`; a value beginning with `=` is evaluated as a JavaScript expression.
- AG Grid explicitly says cell expressions are intended for developer-authored reports, not for giving end users an Excel formula language. String expressions are JavaScript evaluation and have CSP/security implications.
- Column data types select suitable editors and parsers. Custom editors, renderers, filters, and selectors are registered directly or by name in a component map. Column types can bundle reusable column behavior.

### Excel-like formulas

For real user formulas, the common pattern is to pair AG Grid with a dedicated engine such as HyperFormula, or to implement a domain-specific calculation layer and feed calculated values back through `valueGetter`/row updates. AG Grid itself does not provide Excel-compatible dependency-graph semantics, formula translation on fill, or a formula language designed for end users.

Sources:

- [AG Grid cell expressions](https://www.ag-grid.com/javascript-data-grid/cell-expressions/)
- [AG Grid cell editing and data types](https://www.ag-grid.com/javascript-data-grid/cell-editing/)
- [AG Grid custom components and named registration](https://www.ag-grid.com/javascript-data-grid/components/)
- [AG Grid licensing by package](https://github.com/AG-grid/ag-grid/blob/latest/LICENSE.txt)

**License:** `ag-grid-community`, framework adapters, locale, and styles are MIT; `ag-grid-enterprise` is commercial. Formula support is not an Enterprise feature supplied by AG Grid itself.

## 4. Formula Engines and Spreadsheet Libraries

### HyperFormula

HyperFormula is a headless TypeScript calculation engine. It is UI-independent and can run in browser or Node. The core API is workbook/sheet/cell based: build an engine, add sheets, set cell contents such as `=B1*B2`, read values, subscribe to recalculation changes, and register named expressions or custom functions.

Capabilities documented by Handsontable include:

- Roughly 386 to 400 built-in functions across math, statistical, financial, logical, lookup, text, date, engineering, matrix, and information categories.
- Cell and range references, cross-sheet references, named expressions, array formulas, dependency graph recalculation, custom functions, volatile functions, and Excel/Google Sheets compatibility documentation.
- Internationalization: localized function names, locale-aware parsing, date/time handling, and currency handling.
- Typed values and spreadsheet errors such as `#REF!`, `#VALUE!`, `#DIV/0!`, and `#N/A`.

**Critical license finding:** HyperFormula is **dual licensed**. The source is GPLv3 for GPL-compatible use. A proprietary application requires a purchased proprietary license key. The Handsontable integration key (`internal-use-in-handsontable`) is only valid when connected to Handsontable; it is not a general server or standalone-app license. Treat HyperFormula as commercially usable only after a license agreement and key are obtained.

Sources:

- [HyperFormula documentation](https://hyperformula.handsontable.com/docs/)
- [HyperFormula basic operations](https://hyperformula.handsontable.com/docs/guide/basic-usage.html)
- [HyperFormula built-in functions](https://hyperformula.handsontable.com/docs/guide/built-in-functions.html)
- [HyperFormula types and errors](https://hyperformula.handsontable.com/docs/guide/types-of-values.html)
- [HyperFormula internationalization](https://hyperformula.handsontable.com/docs/guide/i18n-features.html)
- [HyperFormula license key rules](https://hyperformula.handsontable.com/docs/guide/license-key.html)
- [HyperFormula dependency graph](https://hyperformula.handsontable.com/docs/guide/dependency-graph.html)

### Handsontable

Handsontable supplies a spreadsheet-like UI and a `Formulas` plugin powered by HyperFormula. It supports formula cells, cross-sheet references, named expressions, custom functions, and an `afterFormulasValuesUpdate` hook. It also documents limitations around nested object data, source/visual indexes, and moving formula-bearing rows/columns.

**License:** Handsontable has commercial licensing for production use; examples commonly use `non-commercial-and-evaluation`. Do not treat it as a permissive replacement for a headless engine.

Source: [Handsontable formula calculation](https://handsontable.com/docs/javascript-data-grid/formula-calculation/)

### FortuneSheet

FortuneSheet is a React-oriented, feature-rich spreadsheet UI descended from Luckysheet. It includes typed-looking cell formatting, built-in formulas, multiple sheets, validation, undo/redo, collaboration operations, and custom tools. It uses a fork of Handsontable’s older `formula-parser`, rather than HyperFormula. This makes it a useful UI reference, but the formula engine is older and the data model is a spreadsheet grid rather than a domain table.

**License:** MIT.

Source: [FortuneSheet repository](https://github.com/ruilisi/fortune-sheet)

### Univer

Univer is a larger isomorphic office SDK. Its architecture is plugin-first: formula engine, sheets model, rendering, UI, number formatting, and Facade APIs are separate plugins. It supports browser and Node/headless use, custom plugins, i18n, and spreadsheet formulas. Its README explicitly separates open-source Sheets capabilities from commercial Univer Pro features.

**License:** OSS repository is Apache-2.0. Pro packages and features are commercial and must be evaluated separately.

Source: [Univer repository and license](https://github.com/dream-num/univer)

### Smaller parsers and expression libraries

| Library | License | Shape | Suitability |
|---|---|---|---|
| `fast-formula-parser` | MIT | Excel parser/evaluator; about 280 functions; cell/range callbacks; dependency parser; explicit FormulaError types | Strong candidate for a small Excel subset if its age and maintenance are acceptable. It requires us to own dependency tracking/recalculation and typed domain adapters. |
| `hot-formula-parser` | MIT | Older parser with cell/range hooks, custom functions, variables, and standard spreadsheet errors | Easy to embed, but archived/deprecated in favor of HyperFormula and published about six years ago. Avoid for a new long-lived foundation unless vendored and tested. |
| `mathjs` | Apache-2.0, with an LGPL-2.1+ CSparse component | General mathematical expression parser; numbers, BigNumbers, units, matrices, complex values, extensible typed functions | Good for scientific math expressions, not an Excel-compatible cell/range engine. Requires careful function sandboxing and a separate reference/dependency model. |
| `expr-eval` | MIT | Small mathematical expression evaluator with variables, custom functions, arrays, ternary, and configurable operators | Good for a restricted calculation language. It lacks native Excel cell/range semantics and spreadsheet error behavior. Maintenance is stale. |

Sources:

- [`fast-formula-parser` npm/readme](https://www.npmjs.com/package/fast-formula-parser)
- [`hot-formula-parser` npm/readme](https://www.npmjs.com/package/hot-formula-parser)
- [Archived Handsontable formula-parser](https://github.com/handsontable/formula-parser)
- [mathjs repository and license](https://github.com/josdejong/mathjs)
- [`expr-eval` npm/readme](https://www.npmjs.com/package/expr-eval)

**License conclusion:** none of these four is GPL/SSPL. HyperFormula is the licensing outlier. Still perform a dependency/SBOM review: permissive top-level licensing does not eliminate obligations from transitive dependencies.

## 5. Architecture Patterns

### Column and cell seams

Across AG Grid, TanStack Table, Notion, Airtable, and Helix’s existing ADR, the recurring seams are:

1. **Column definition/registry:** stable ID, label, domain type, access path, default width, capabilities, and metadata.
2. **Value pipeline:** raw storage value -> parse/validate -> canonical typed value -> formula input -> sort/filter value -> display formatting.
3. **Editor registry:** type-specific editor, edit lifecycle, validation, commit/cancel behavior, and keyboard affordances.
4. **Renderer registry:** type-specific cell renderer, empty/error/loading states, and optional compact/read-only renderer.
5. **Filter/sort/aggregate registry:** operations are type-owned or selected from typed registries rather than hardcoded in the table component.
6. **Formula adapter:** parser/AST, reference resolver, dependency graph, evaluator, error model, and recalculation events are separate from rendering.

AG Grid demonstrates named component registries and reusable column types. TanStack Table demonstrates a headless table model where accessors, cells, sorting, filtering, grouping, and metadata are supplied by the consumer. Its v9 docs also type registry names from the configured feature set. Airtable demonstrates applying one computed-field definition to every row, with output formatting based on the formula result type. Notion similarly makes formula outputs behave as typed properties.

Sources:

- [AG Grid custom component registration](https://www.ag-grid.com/javascript-data-grid/components/)
- [AG Grid column types](https://www.ag-grid.com/javascript-data-grid/column-definitions/)
- [TanStack Table column definitions](https://tanstack.com/table/latest/docs/guide/column-defs)
- [TanStack Table repository](https://github.com/TanStack/table)
- [Airtable formula field overview](https://support.airtable.com/docs/formula-field-overview)
- [Airtable formula functions](https://support.airtable.com/docs/formula-field-reference)
- [Helix ADR-0010](../adr/0010-column-type-registry.md)

### Recommended conceptual interfaces

```ts
type CellTypeId = string

interface CellType<T> {
  id: CellTypeId
  valueKind: "text" | "number" | "boolean" | "date" | "reference" | "list" | "error"
  parse(input: unknown, context: ParseContext): ParseResult<T>
  format(value: T, context: FormatContext): string
  editor: CellEditorFactory<T>
  renderer: CellRendererFactory<T>
  filterOps: FilterOperator[]
  formulaValue(value: T): FormulaValue
}

interface FormulaColumn {
  columnId: string
  expression: string
  declaredResultKind?: CellTypeId
}
```

The exact interfaces can differ, but the formula engine should consume canonical values and return a typed value/error, never UI strings.

## 6. Formula Essentials

### Minimal useful function set

The common first layer across Airtable, Google Sheets, Notion, and spreadsheet engines is:

- Arithmetic: `+`, `-`, `*`, `/`, `%`, exponentiation, `ABS`, `MIN`, `MAX`, `ROUND`, `CEILING`, `FLOOR`.
- Aggregation: `SUM`, `AVERAGE`, `COUNT`, `COUNTA`, `MEDIAN`.
- Logic: `IF`, `IFS`, `AND`, `OR`, `NOT`, `XOR`, `IFERROR`, `ISBLANK`, `ISNUMBER`, `ISTEXT`.
- Text: concatenation (`&` or `CONCAT`/`CONCATENATE`), `LEN`, `LEFT`, `RIGHT`, `MID`, `LOWER`, `UPPER`, `TRIM`, `SUBSTITUTE`, `TEXT`.
- Dates: `TODAY`, `NOW`, `DATE`, `YEAR`, `MONTH`, `DAY`, date difference, date add, and date formatting.
- Lookup/reference, when needed: `INDEX`, `MATCH`, `VLOOKUP` or `XLOOKUP`.
- Lab-specific additions later: unit conversion, significant figures, concentration/molarity helpers, uncertainty propagation, and reference-aware functions.

Google Sheets exposes a much larger catalog, including arrays, filters, lookups, dates, and error inspection. Airtable intentionally constrains formulas to the current record and uses linked records plus lookup/rollup fields for cross-record computation. That constraint is attractive for ordinary LIMS schema columns because it prevents hidden whole-table dependencies.

### Types, coercion, and errors

Do not represent errors as `null` or silently coerce all values to strings. Preserve a tagged result:

```ts
type FormulaResult =
  | { kind: "value"; value: FormulaValue }
  | { kind: "error"; code: "REF" | "VALUE" | "DIV0" | "NAME" | "NA" | "NUM" | "CYCLE"; message?: string }
```

At minimum, define explicit rules for blank values, number/text coercion, boolean coercion, date serials versus ISO dates, list aggregation, and invalid references. Surface the error code in the cell and retain the diagnostic for the editor/tool-tip. `IFERROR` should be able to consume an error without destroying provenance.

Sources:

- [Google Sheets function list](https://support.google.com/docs/table/25273)
- [Airtable formula functions reference](https://support.airtable.com/docs/formula-field-reference)
- [Airtable formula field overview](https://support.airtable.com/docs/formula-field-overview)
- [HyperFormula types and errors](https://hyperformula.handsontable.com/docs/guide/types-of-errors.html)
- [fast-formula-parser errors and types](https://www.npmjs.com/package/fast-formula-parser)

## Design Takeaways for Helix

1. **Separate database tables from spreadsheet tables.** Default LIMS/ELN tables should use typed columns and one formula definition per column, referencing stable column IDs or names. Offer arbitrary cell formulas only in a deliberate spreadsheet/table block.
2. **Make the column type registry the product seam.** Extend ADR-0010 with frontend editor/renderer/formatter/filter hooks and a formula adapter. Keep backend identity and validation authoritative; let the frontend discover metadata and component capabilities.
3. **Canonicalize values before formula evaluation.** Number, date, boolean, reference, list, and domain values must enter the engine as tagged values. Formatting belongs after evaluation, so a displayed `10.0 uM` does not become an ambiguous string input.
4. **Use a dependency-aware calculation service, not grid expressions.** AG Grid expressions are JavaScript and explicitly not intended for end-user formulas. Choose or build an engine with a restricted function registry, dependency graph, cycle detection, errors, and recalculation events.
5. **Design for licensing and auditability from the start.** HyperFormula requires GPLv3 compliance or a commercial license. MIT/Apache alternatives are more permissive but may require us to implement dependency management. Persist formula text, parsed/reference metadata, result type, engine version, and calculation errors so CFR Part 11 audit history can explain changes.

### Practical recommendation

Start with a small, typed, row-oriented formula language using named column references and the minimal function set above. Build the table UI headlessly around the existing column registry. Keep the formula engine behind an interface so a later decision between an in-house evaluator, `fast-formula-parser`, or a commercially licensed HyperFormula does not leak into cell renderers, editors, or domain mods.
