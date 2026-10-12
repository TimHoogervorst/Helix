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
 * | dropdown        | Multi-select dropdown   |
 * | entity-picker   | Entity search popover   |
 * | range           | Two inputs (min, max)   |
 * | none            | No input (e.g. is_empty)|
 */

import { useState, useCallback, useRef, type InputHTMLAttributes } from "react";
import { Select } from "../../../shell/src/shared/primitives/Input";
import { EntityPickerPopover } from "../../../shell/src/shared/components/EntityPickerPopover";

// ── Auto-sizing input ───────────────────────────────────────────────────────
// Uses a hidden <span> in the same CSS grid cell to measure text width.
// The grid cell naturally sizes to the span, and the input fills it.

function AutoSizeInput({
  className,
  sizerText,
  inputProps,
}: {
  className: string;
  sizerText: string;
  inputProps: InputHTMLAttributes<HTMLInputElement>;
}) {
  return (
    <span className="entities-auto-size-wrap">
      <span className="entities-auto-size-sizer" aria-hidden="true">
        {sizerText || " "}
      </span>
      <input className={className} {...inputProps} />
    </span>
  );
}

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
  /** Dropdown options for dropdown-type filter inputs. When provided and the
   *  operandShape is "dropdown", renders a multi-select dropdown instead of a
   *  text input. */
  dropdownOptions?: string[];
  /** ID of the target Schema when the column type is "reference". Scopes the
   *  entity picker search to entities of that schema. */
  referenceSchemaId?: number;
  /** Workspace context for entity search. */
  workspaceId?: string;
  /** Projects accessible to the viewer, for the project-picker operand shape.
   *  Each entry has an id (PK), name, icon_key, and color_key. */
  projectOptions?: Array<{ id: number; name: string; icon_key: string; color_key: string }>;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ValueInput({
  operandShape,
  value,
  onChange,
  disabled = false,
  placeholder = "Value…",
  dropdownOptions,
  referenceSchemaId,
  workspaceId,
  projectOptions,
}: ValueInputProps) {
  switch (operandShape) {
    case "text":
      return (
        <AutoSizeInput
          className="entities-filter-search"
          sizerText={String(value) || placeholder}
          inputProps={{
            type: "text",
            placeholder,
            value,
            onChange: (e) => onChange(e.target.value),
            disabled,
          }}
        />
      );

    case "number":
      return (
        <AutoSizeInput
          className="entities-filter-search"
          sizerText={String(value) || placeholder}
          inputProps={{
            type: "number",
            placeholder,
            value,
            onChange: (e) => onChange(e.target.value),
            disabled,
          }}
        />
      );

    case "date":
      return (
        <AutoSizeInput
          className="entities-filter-search"
          sizerText={value || "YYYY-MM-DD"}
          inputProps={{
            type: "date",
            value,
            onChange: (e) => onChange(e.target.value),
            disabled,
          }}
        />
      );

    case "boolean":
      return (
        <Select
          className="entities-filter-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">--</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </Select>
      );

    case "dropdown":
      if (dropdownOptions && dropdownOptions.length > 0) {
        return (
          <Select
            className="entities-filter-select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">--</option>
            {dropdownOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        );
      }
      // Fallback: comma-separated values entered as text when no dropdown
      // options are available.
      return (
        <AutoSizeInput
          className="entities-filter-search"
          sizerText={value || "option1, option2…"}
          inputProps={{
            type: "text",
            placeholder: "option1, option2…",
            value,
            onChange: (e) => onChange(e.target.value),
            disabled,
          }}
        />
      );

    case "entity-picker":
      return (
        <EntityPickerFilter
          value={value}
          onChange={onChange}
          disabled={disabled}
          referenceSchemaId={referenceSchemaId}
          workspaceId={workspaceId}
        />
      );

    case "range":
      return <RangeInput value={value} onChange={onChange} disabled={disabled} />;

    case "none":
      // No value input needed (e.g. "is_empty" operator)
      return (
        <span className="entities-filter-pill-none-value">
          (no value needed)
        </span>
      );

    case "project-picker":
      if (projectOptions && projectOptions.length > 0) {
        return (
          <Select
            className="entities-filter-select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            data-testid="project-picker-select"
          >
            <option value="">--</option>
            {projectOptions.map((proj) => (
              <option key={proj.id} value={String(proj.id)}>
                {proj.name}
              </option>
            ))}
          </Select>
        );
      }
      return (
        <AutoSizeInput
          className="entities-filter-search"
          sizerText={value || "1, 2…"}
          inputProps={{
            type: "text",
            placeholder: "1, 2…",
            value,
            onChange: (e) => onChange(e.target.value),
            disabled,
          }}
        />
      );

    default:
      // Unknown shape — fall back to text input
      return (
        <AutoSizeInput
          className="entities-filter-search"
          sizerText={String(value) || placeholder}
          inputProps={{
            type: "text",
            placeholder,
            value,
            onChange: (e) => onChange(e.target.value),
            disabled,
          }}
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
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <AutoSizeInput
        className="entities-filter-search"
        sizerText={min || "Min"}
        inputProps={{
          type: disabled ? "text" : "number",
          placeholder: "Min",
          value: min,
          onChange: (e) => handleMinChange(e.target.value),
          disabled,
        }}
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
      <AutoSizeInput
        className="entities-filter-search"
        sizerText={max || "Max"}
        inputProps={{
          type: disabled ? "text" : "number",
          placeholder: "Max",
          value: max,
          onChange: (e) => handleMaxChange(e.target.value),
          disabled,
        }}
      />
    </div>
  );
}

// ── Entity Picker Filter ──────────────────────────────────────────────────

function EntityPickerFilter({
  value,
  onChange,
  disabled = false,
  referenceSchemaId,
  workspaceId,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  referenceSchemaId?: number;
  workspaceId?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleSelect = useCallback(
    (displayId: string) => {
      onChange(displayId);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange("");
  }, [onChange]);

  const handleToggle = useCallback(() => {
    if (!disabled) setOpen((prev) => !prev);
  }, [disabled]);

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 2 }}>
      <button
        ref={triggerRef}
        type="button"
        className="entities-filter-pill-field"
        onClick={handleToggle}
        disabled={disabled}
        data-testid="entity-picker-trigger"
      >
        {value || "Select entity\u2026"}
      </button>
      {!disabled && value && (
        <button
          type="button"
          onClick={handleClear}
          className="entities-filter-pill-remove"
          title="Clear"
          aria-label="Clear entity"
          data-testid="entity-picker-clear"
        >
          ×
        </button>
      )}
      <EntityPickerPopover
        referenceSchemaId={referenceSchemaId}
        workspaceId={workspaceId}
        open={open}
        onOpenChange={setOpen}
        onSelect={handleSelect}
      />
    </span>
  );
}
