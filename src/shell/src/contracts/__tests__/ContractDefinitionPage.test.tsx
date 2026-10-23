import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "../../api/client";
import ContractDefinitionPage from "../ContractDefinitionPage";

const { getText } = vi.hoisted(() => ({ getText: vi.fn() }));

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client");
  return { ...actual, getText };
});

const vectorsPath = resolve(
  import.meta.dirname,
  "../../../../helix_core/mod_system/contract_golden_vectors.json",
);

function renderContractPage() {
  return render(
    <MemoryRouter initialEntries={["/contracts/data/acme.publisher.measurement/1.0.0"]}>
      <Routes>
        <Route
          path="/contracts/:kind/:contractId/:version"
          element={<ContractDefinitionPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ContractDefinitionPage", () => {
  beforeEach(() => {
    getText.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads an exact retained definition and renders it without supplier metadata", async () => {
    const vectors = JSON.parse(await readFile(vectorsPath, "utf8")) as {
      contracts: Array<{ name: string; source: string }>;
    };
    const vector = vectors.contracts.find(
      ({ name }) => name === "exact-scientific-number-and-unicode-description",
    );
    if (!vector) throw new Error("Exact contract vector is missing.");
    getText.mockResolvedValue(vector.source);

    renderContractPage();

    expect(await screen.findByRole("heading", { name: "acme.publisher.measurement" })).toBeTruthy();
    expect(screen.getByText("Potential measured in μV")).toBeTruthy();
    expect(screen.getByText("12345678901234567890123456789e-40")).toBeTruthy();
    expect(getText).toHaveBeenCalledWith(
      "/contracts/data/acme.publisher.measurement/1.0.0",
      expect.any(AbortSignal),
    );
    expect(screen.queryByText(/supplied by|provider|owner/i)).toBeNull();
  });

  it("shows a generic raw definition when a future type has no specialized presentation", async () => {
    getText.mockResolvedValue(
      '{"formatVersion":1,"kind":"data","id":"acme.publisher.measurement","version":"1.0.0","description":"An unknown but retained meaning","definition":{"type":{"type":"futureType","detail":"kept exactly"}}}',
    );

    renderContractPage();

    expect(await screen.findByText("type · unrecognized definition type")).toBeTruthy();
    expect(screen.getByText('{"detail":"kept exactly","type":"futureType"}')).toBeTruthy();
  });

  it("uses a clear fallback when the exact retained definition is absent", async () => {
    getText.mockRejectedValue(new ApiError(404, { code: "CONTRACT_NOT_FOUND" }));

    renderContractPage();

    expect(await screen.findByRole("heading", { name: "Retained definition unavailable" })).toBeTruthy();
    expect(screen.getByText(/No retained contract matches this exact kind/)).toBeTruthy();
  });
});
