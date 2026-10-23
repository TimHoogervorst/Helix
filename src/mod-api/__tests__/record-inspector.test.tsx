// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecordValueInspector, UnavailableRecordCapability } from "../src/records";

describe("generic retained-record inspection", () => {
  it("shows nested values and distinguishes exact from current references", () => {
    render(<RecordValueInspector value={{
      observations: [{ value: 4.2, unit: "mg/L" }],
      exact: { type: "recordReference", value: { id: "target-a", revision: "revision-a", group_id: "group-a" } },
      unavailableExact: { type: "recordReference", value: { id: "target-c", revision: "revision-c" } },
      current: { type: "recordReference", value: { id: "target-b" } },
    }} />);

    expect(screen.getByText(/4.2/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Exact record reference · Revision revision-a/ }).getAttribute("href"))
      .toBe("/records/target-a?group_id=group-a&revision_id=revision-a");
    expect(screen.getByText(/Exact Revision reference unavailable · target-c/)).toBeTruthy();
    expect(screen.getByText(/Current record reference/)).toBeTruthy();
  });

  it("uses retained exact definitions to explain quantities and declared operations", () => {
    render(<RecordValueInspector
      value={{ type: "contract", contract: { kind: "data", id: "fixture.science.measurement", version: "1.0.0" }, value: { amount: 4.2 } }}
      definitions={[
        { kind: "data", id: "fixture.science.measurement", version: "1.0.0", envelope: {
          description: "Recorded concentration", definition: { type: "object", fields: {
            amount: { type: "quantity", valueType: "number", unit: "mg/L", description: "Mass concentration" },
          } },
        } },
        { kind: "action", id: "fixture.science.calculate", version: "1.0.0", envelope: {
          description: "Calculate result", definition: { inputs: { sample: { type: "recordReference" } }, outputs: { result: { type: "number" } } },
        } },
      ]}
    />);

    expect(screen.getByText("Recorded concentration")).toBeTruthy();
    expect(screen.getByText("Mass concentration")).toBeTruthy();
    expect(screen.getByText("mg/L")).toBeTruthy();
  });

  it("states why an optional capability is unavailable while retaining generic inspection", () => {
    render(<UnavailableRecordCapability capability="Specialized viewer" reason="Provider was removed." />);
    expect(screen.getByRole("status").textContent).toContain("Retained values remain available");
  });
});
