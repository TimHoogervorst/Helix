import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FormulaEditorModal from "../FormulaEditorModal";
import type { ColumnDef } from "../../types";
import { post } from "../../../../shell/src/api/client";

vi.mock("../../../../shell/src/api/client", () => ({ post: vi.fn() }));

const mockPost = vi.mocked(post);

const column: ColumnDef = {
  name: "Total",
  type: "formula",
  expression: "[Amount] * 2",
  resultType: "number",
};

function renderEditor(expression = column.expression) {
  return render(
    <FormulaEditorModal
      open
      column={{ ...column, expression }}
      siblingColumns={[{ name: "Amount", type: "number" }]}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />,
  );
}

describe("FormulaEditorModal test bench", () => {
  it("previews client-evaluable expressions locally", async () => {
    renderEditor();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Sample value for Amount" }),
      {
        target: { value: "4" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Evaluate" }));

    expect(
      await screen.findByTestId("formula-evaluation-result"),
    ).toHaveTextContent("8");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("routes backend-only expressions through the gateway", async () => {
    mockPost.mockResolvedValue({
      results: { Total: { ok: true, value: 0.5 } },
    });
    renderEditor("molBio.gcContent([Sequence])");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Sample value for Sequence" }),
      {
        target: { value: "ATGC" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Evaluate" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/formulas/evaluate/", {
      expressions: { Total: "molBio.gcContent([Sequence])" },
        row: { Sequence: "ATGC" },
      }),
    );
    expect(
      await screen.findByTestId("formula-evaluation-result"),
    ).toHaveTextContent("0.5");
  });
});
