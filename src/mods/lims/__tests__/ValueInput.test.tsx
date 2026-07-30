/**
 * Tests for ValueInput — operand_shape → component dispatch.
 *
 * Each operand_shape from the column type registry must render the correct
 * input component, matching the mapping defined in issue #338.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ValueInput } from "../hub/ValueInput";
import type { ValueInputProps } from "../hub/ValueInput";

// ── Helpers ────────────────────────────────────────────────────────────────

function setup(overrides: Partial<ValueInputProps> = {}) {
  const props: ValueInputProps = {
    operandShape: "text",
    value: "",
    onChange: () => {},
    ...overrides,
  };
  return render(<ValueInput {...props} />);
}

// ── Text shape ─────────────────────────────────────────────────────────────

describe("ValueInput — text shape", () => {
  it("renders a text input", () => {
    setup({ operandShape: "text" });
    const input = screen.getByPlaceholderText("Value…");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBe("text");
  });

  it("fires onChange with typed value", () => {
    const onChange = vi.fn();
    setup({ operandShape: "text", onChange });
    const input = screen.getByPlaceholderText("Value…");
    fireEvent.change(input, { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("respects disabled prop", () => {
    setup({ operandShape: "text", disabled: true });
    const input = screen.getByPlaceholderText("Value…");
    expect(input).toBeDisabled();
  });

  it("respects placeholder prop", () => {
    setup({ operandShape: "text", placeholder: "Search…" });
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
  });
});

// ── Number shape ───────────────────────────────────────────────────────────

describe("ValueInput — number shape", () => {
  it("renders a number input", () => {
    setup({ operandShape: "number" });
    const input = screen.getByPlaceholderText("Value…");
    expect(input.getAttribute("type")).toBe("number");
  });

  it("allows numeric entry", () => {
    const onChange = vi.fn();
    setup({ operandShape: "number", onChange });
    const input = screen.getByPlaceholderText("Value…");
    fireEvent.change(input, { target: { value: "42" } });
    expect(onChange).toHaveBeenCalled();
  });
});

// ── Date shape ─────────────────────────────────────────────────────────────

describe("ValueInput — date shape", () => {
  it("renders a date input", () => {
    setup({ operandShape: "date" });
    const input = screen.getByDisplayValue(""); // date input with no value
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBe("date");
  });

  it("shows current value in date input", () => {
    setup({ operandShape: "date", value: "2025-03-15" });
    const input = screen.getByDisplayValue("2025-03-15");
    expect(input.getAttribute("type")).toBe("date");
  });
});

// ── Boolean shape ──────────────────────────────────────────────────────────

describe("ValueInput — boolean shape", () => {
  it("renders a select with Yes/No options", () => {
    setup({ operandShape: "boolean" });
    const select = screen.getByRole("combobox");
    expect(select.tagName).toBe("SELECT");
    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("selects 'Yes' when value is 'true'", () => {
    setup({ operandShape: "boolean", value: "true" });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("true");
  });

  it("selects 'No' when value is 'false'", () => {
    setup({ operandShape: "boolean", value: "false" });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("false");
  });

  it("fires onChange when selection changes", () => {
    const onChange = vi.fn();
    setup({ operandShape: "boolean", onChange });
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "true" } });
    expect(onChange).toHaveBeenCalledWith("true");
  });
});

// ── Dropdown shape ─────────────────────────────────────────────────────────

describe("ValueInput — dropdown shape", () => {
  it("renders a text input with multi-select placeholder", () => {
    setup({ operandShape: "dropdown" });
    const input = screen.getByPlaceholderText("option1, option2…");
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBe("text");
  });

  it("shows current comma-separated value", () => {
    setup({ operandShape: "dropdown", value: "alpha, beta" });
    const input = screen.getByDisplayValue("alpha, beta");
    expect(input).toBeInTheDocument();
  });
});

// ── Entity-picker shape ────────────────────────────────────────────────────

describe("ValueInput — entity-picker shape", () => {
  it("renders a text input with Display ID placeholder", () => {
    setup({ operandShape: "entity-picker" });
    const input = screen.getByPlaceholderText("Display ID…");
    expect(input.tagName).toBe("INPUT");
  });
});

// ── Range shape ────────────────────────────────────────────────────────────

describe("ValueInput — range shape", () => {
  it("renders two number inputs with 'to' separator", () => {
    setup({ operandShape: "range" });
    const minInput = screen.getByPlaceholderText("Min");
    const maxInput = screen.getByPlaceholderText("Max");
    expect(minInput).toBeInTheDocument();
    expect(maxInput).toBeInTheDocument();
    expect(minInput.getAttribute("type")).toBe("number");
    expect(maxInput.getAttribute("type")).toBe("number");
    expect(screen.getByText("to")).toBeInTheDocument();
  });

  it("splits comma-separated value into min/max", () => {
    setup({ operandShape: "range", value: "10,50" });
    const minInput = screen.getByDisplayValue("10");
    const maxInput = screen.getByDisplayValue("50");
    expect(minInput).toBeInTheDocument();
    expect(maxInput).toBeInTheDocument();
  });

  it("calls onChange with 'min,max' format when min changes", () => {
    const onChange = vi.fn();
    setup({ operandShape: "range", onChange, value: "10,50" });
    const minInput = screen.getByDisplayValue("10");
    fireEvent.change(minInput, { target: { value: "5" } });
    // onChange should be called with updated min value
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toContain("5");
  });
});

// ── None shape ─────────────────────────────────────────────────────────────

describe("ValueInput — none shape", () => {
  it("renders '(no value needed)' text instead of an input", () => {
    setup({ operandShape: "none" });
    expect(screen.getByText("(no value needed)")).toBeInTheDocument();
    // No input element should be present
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

// ── Unknown / fallback shape ───────────────────────────────────────────────

describe("ValueInput — unknown shape fallback", () => {
  it("renders a text input for unrecognized operand_shape", () => {
    setup({ operandShape: "unknown-bizarre-shape" });
    const input = screen.getByPlaceholderText("Value…");
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBe("text");
  });
});
