/**
 * Value input dispatcher — renders the correct input component based on
 * an operator's ``operandShape``.
 *
 * Shape → component mapping (from the issue #338 spec):
 *
 * | operand_shape   | Rendered Input          |
 * |-----------------|-------------------------|
 * | text            | Text input              |
 * | number          | Number input            |
 * | date            | Date picker             |
 * | boolean         | Checkbox                |
 * | select          | Multi-select dropdown   |
 * | entity-picker   | Entity search popover   |
 * | range           | Two inputs (min, max)   |
 * | none            | No input (e.g. is_empty)|
 */

import { useState, useCallback } from "react";

// ── Props ───────────────────────────────────────────────────────────────────

export interface ValueInputProps {
  /** The ``operandShape`` from the selected operator. */
  operandShape: string;
  /** Current value. */
  value: string;
  /** Called when the value changes. */
  onChange: (value: string) => void;
  /** When true, the input is disabled. */
  disabled?: boolean;
  /** Placeholder text for text/number inputs. */
  placeholder?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ValueInput({
  operandShape,
  value,
  onChange,
  disabled = false,
  placeholder = "Value…",
}: ValueInputProps) {
  switch (operandShape) {
    case "text":
      return (
        <input
          className="entities-filter-search"
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ flex: 1 }}
        />
      );

    case "number":
      return (
        <input
          className="entities-filter-search"
          type="number"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ flex: 1 }}
        />
      );

    case "date":
      return (
        <input
          className="entities-filter-search"
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ flex: 1 }}
        />
      );

    case "boolean":
      return (
        <select
          className="entities-filter-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ flex: 1 }}
        >
          <option value="">--</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );

    case "select":
      // Multi-select: comma-separated values entered as text for now.
      // A full multi-select dropdown would need dropdown options from the
      // column definition — that's a follow-up feature.
      return (
        <input
          className="entities-filter-search"
          type="text"
          placeholder="option1, option2…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ flex: 1 }}
        />
      );

    case "entity-picker":
      return (
        <input
          className="entities-filter-search"
          type="text"
          placeholder="Display ID…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ flex: 1 }}
        />
      );

    case "range":
      return <RangeInput value={value} onChange={onChange} disabled={disabled} />;

    case "none":
      // No value input needed (e.g. "is_empty" operator)
      return (
        <span
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            color: "var(--color-muted-foreground, #888)",
            fontSize: "0.8125rem",
          }}
        >
          (no value needed)
        </span>
      );

    default:
      // Unknown shape — fall back to text input
      return (
        <input
          className="entities-filter-search"
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ flex: 1 }}
        />
      );
  }
}

// ── Range Input (min/max) ───────────────────────────────────────────────────

function RangeInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  // Range values are stored as "min,max"
  const parts = value.split(",");
  const min = parts[0] ?? "";
  const max = parts.slice(1).join(","); // value after first comma

  const handleMinChange = useCallback(
    (newMin: string) => {
      onChange(`${newMin},${max}`);
    },
    [max, onChange],
  );

  const handleMaxChange = useCallback(
    (newMax: string) => {
      onChange(`${min},${newMax}`);
    },
    [min, onChange],
  );

  return (
    <div style={{ display: "flex", gap: 4, flex: 1 }}>
      <input
        className="entities-filter-search"
        type={disabled ? "text" : "number"}
        placeholder="Min"
        value={min}
        onChange={(e) => handleMinChange(e.target.value)}
        disabled={disabled}
        style={{ flex: 1, minWidth: 0 }}
      />
      <span
        style={{
          display: "flex",
          alignItems: "center",
          color: "var(--color-muted-foreground, #888)",
          fontSize: "0.75rem",
          flexShrink: 0,
        }}
      >
        to
      </span>
      <input
        className="entities-filter-search"
        type={disabled ? "text" : "number"}
        placeholder="Max"
        value={max}
        onChange={(e) => handleMaxChange(e.target.value)}
        disabled={disabled}
        style={{ flex: 1, minWidth: 0 }}
      />
    </div>
  );
}
