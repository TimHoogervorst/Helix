import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement, Fragment, StrictMode } from "react";
import { ModLoader } from "../ModLoader";
import { ModRegistry } from "../ModRegistry";
import { resetFrontendBootForTests } from "../boot";

const bootControls = vi.hoisted(() => ({
  importError: null as Error | null,
  importGate: null as Promise<void> | null,
  registerError: null as Error | null,
  importCount: 0,
  registerCount: 0,
  registrationOrder: [] as string[],
}));

const activeBootData = (activeMods: string[], activeModManifests?: Record<string, unknown>[]) => ({
  activeMods,
  activeModManifests: activeModManifests ?? activeMods.map((id) => id === "test.external"
    ? { id, displayName: "Platform Fixture", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["backend", "frontend"], dependsOn: [] }
    : { id, displayName: id === "test.core" ? "Core" : "Orphan", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [] }),
  registry: {},
});

vi.mock("../external", () => ({
  externalJsonManifestModules: {
    ...import.meta.glob("../../../../helix_core/tests/fixtures/external_mod/modManifest.json", { eager: true }),
    "orphan/modManifest.json": { default: { id: "test.orphan", displayName: "Orphan", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [] } },
    "consumer/modManifest.json": { default: { id: "aaa.consumer", displayName: "Consumer", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [{ id: "test.backend", version: "^1.0.0" }] } },
    "base/modManifest.json": { default: { id: "zzz.base", displayName: "Base", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [] } },
  },
  externalModLoaders: {
    ...Object.fromEntries(Object.entries(
    import.meta.glob("../../../../helix_core/tests/fixtures/external_mod/index.ts"),
  ).map(([path, load]) => [path, async () => {
    if (bootControls.importError) throw bootControls.importError;
    await bootControls.importGate;
    bootControls.importCount += 1;
    return load();
  }])),
    "consumer/index.ts": async () => ({ meta: { id: "aaa.consumer" }, register: () => bootControls.registrationOrder.push("consumer") }),
    "base/index.ts": async () => ({ meta: { id: "zzz.base" }, register: () => bootControls.registrationOrder.push("base") }),
  },
}));
vi.mock("../bundled", () => ({
  bundledJsonManifestModules: { "core/modManifest.json": { default: { id: "test.core", displayName: "Core", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [] } } },
  bundledModModules: { "core/index.ts": { register: () => {
    bootControls.registerCount += 1;
    if (bootControls.registerError) throw bootControls.registerError;
  } } },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  bootControls.importError = null;
  bootControls.importGate = null;
  bootControls.registerError = null;
  bootControls.importCount = 0;
  bootControls.registerCount = 0;
  bootControls.registrationOrder = [];
  resetFrontendBootForTests();
  ModRegistry._reset();
});

describe("external package discovery", () => {
  it.each([
    { activeMods: ["test.core", "test.external"], hubs: ["test.external:content"] },
    { activeMods: ["test.core"], hubs: [] },
  ])("boots package contributions for active set $activeMods", async ({ activeMods, hubs }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => activeBootData(activeMods) }));
    render(createElement(ModLoader, null, createElement("p", null, "Booted")));
    await screen.findByText("Booted");
    await waitFor(() => expect([...ModRegistry.getInstance().getHubs().keys()]).toEqual(hubs));
    expect(bootControls.importCount).toBe(activeMods.includes("test.external") ? 1 : 0);
    if (hubs.length) {
      const hub = ModRegistry.getInstance().getHubs().get(hubs[0])!;
      render(createElement(hub.component));
      expect(screen.getByText("Fixture content")).toBeInTheDocument();
    }
  });

  it("accepts a backend-only active Mod without frontend discovery", async () => {
    const manifest = { id: "test.backend", displayName: "Backend", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["backend"], dependsOn: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => activeBootData([manifest.id], [manifest]) }));
    render(createElement(ModLoader, null, createElement("p", null, "Backend only ready")));

    expect(await screen.findByText("Backend only ready")).toBeInTheDocument();
    expect(bootControls.importCount).toBe(0);
    expect(bootControls.registerCount).toBe(0);
  });

  it("registers frontend Mods in complete graph order through a backend-only intermediate", async () => {
    const activeMods = ["aaa.consumer", "test.backend", "zzz.base"];
    const manifests = [
      { id: "aaa.consumer", displayName: "Consumer", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [{ id: "test.backend", version: "^1.0.0" }] },
      { id: "test.backend", displayName: "Backend", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["backend"], dependsOn: [{ id: "zzz.base", version: "^1.0.0" }] },
      { id: "zzz.base", displayName: "Base", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [] },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => activeBootData(activeMods, manifests) }));
    render(createElement(ModLoader, null, createElement("p", null, "Graph ready")));

    expect(await screen.findByText("Graph ready")).toBeInTheDocument();
    expect(bootControls.registrationOrder).toEqual(["base", "consumer"]);
  });

  it.each([
    {
      label: "a missing dependency",
      manifests: [{ id: "test.core", displayName: "Core", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [{ id: "test.backend", version: "^1.0.0" }] }],
      activeMods: ["test.core"],
      error: "depends on 'test.backend', which is not active",
    },
    {
      label: "a cycle",
      manifests: [
        { id: "test.core", displayName: "Core", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [{ id: "test.backend", version: "^1.0.0" }] },
        { id: "test.backend", displayName: "Backend", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["backend"], dependsOn: [{ id: "test.core", version: "^1.0.0" }] },
      ],
      activeMods: ["test.backend", "test.core"],
      error: "Circular dependency detected",
    },
    {
      label: "an incompatible dependency version",
      manifests: [
        { id: "test.core", displayName: "Core", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [{ id: "test.backend", version: "^2.0.0" }] },
        { id: "test.backend", displayName: "Backend", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["backend"], dependsOn: [] },
      ],
      activeMods: ["test.backend", "test.core"],
      error: "requires 'test.backend' at '^2.0.0', but backend metadata reports '1.0.0'",
    },
  ])("fails the real boot sequence for $label", async ({ manifests, activeMods, error }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => activeBootData(activeMods, manifests) }));
    render(createElement(ModLoader, null, createElement("p", null, "Should not render")));

    expect(await screen.findByRole("alert")).toHaveTextContent(error);
    expect(bootControls.registerCount).toBe(0);
    expect(screen.queryByText("Should not render")).not.toBeInTheDocument();
  });

  it("shares one pending boot across StrictMode consumers and genuine remounts", async () => {
    let finishBootData!: (value: {
      ok: boolean;
      json: () => Promise<{ activeMods: string[]; activeModManifests: Record<string, unknown>[]; registry: Record<string, unknown> }>;
    }) => void;
    const fetchMock = vi.fn(() => new Promise((resolve) => {
      finishBootData = resolve as typeof finishBootData;
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = render(createElement(StrictMode, null,
      createElement(Fragment, null,
        createElement(ModLoader, null, createElement("p", null, "First")),
        createElement(ModLoader, null, createElement("p", null, "Concurrent")),
      ),
    ));
    expect(screen.getAllByText(/Loading/i).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finishBootData({ ok: true, json: async () => activeBootData(["test.core"]) });
    await screen.findByText("First");
    await screen.findByText("Concurrent");
    expect(bootControls.registerCount).toBe(1);

    first.unmount();
    render(createElement(ModLoader, null, createElement("p", null, "Second")));
    await screen.findByText("Second");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bootControls.registerCount).toBe(1);
  });

  it("keeps an empty frontend set gated when backend boot data is invalid", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...activeBootData([]), registry: null }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(ModLoader, null, createElement("p", null, "Should not render")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend boot data has no valid registry payload");
    expect(screen.queryByText("Should not render")).not.toBeInTheDocument();
    cleanup();
    render(createElement(ModLoader, null, createElement("p", null, "Still gated")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend boot data has no valid registry payload");
    expect(screen.queryByText("Still gated")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("runs Hydration and final validation even when the active frontend set is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => activeBootData([]) });
    vi.stubGlobal("fetch", fetchMock);
    const hydrate = vi.spyOn(ModRegistry.prototype, "hydrateFromBackend");
    const validate = vi.spyOn(ModRegistry.prototype, "validate");
    render(createElement(ModLoader, null, createElement("p", null, "Booted without frontend contributions")));
    await screen.findByText("Booted without frontend contributions");
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it("keeps application content gated while an active artifact is importing", async () => {
    let finishImport!: () => void;
    bootControls.importGate = new Promise<void>((resolve) => { finishImport = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => activeBootData(["test.core", "test.external"]),
    }));
    render(createElement(ModLoader, null, createElement("p", null, "After import")));
    await waitFor(() => expect(bootControls.registerCount).toBe(0));
    expect(screen.queryByText("After import")).not.toBeInTheDocument();
    finishImport();
    await screen.findByText("After import");
    expect(bootControls.registerCount).toBe(1);
  });

  it("retains an import failure after remount without registering a partial Mod set", async () => {
    bootControls.importError = new Error("fixture import failed");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => activeBootData(["test.core", "test.external"]) });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(ModLoader, null, createElement("p", null, "Should not render")));
    expect(await screen.findByRole("alert")).toHaveTextContent("fixture import failed");
    expect(bootControls.registerCount).toBe(0);
    cleanup();
    render(createElement(ModLoader, null, createElement("p", null, "Still gated")));
    expect(await screen.findByRole("alert")).toHaveTextContent("fixture import failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Still gated")).not.toBeInTheDocument();
  });

  it("fails when an active frontend artifact has no discovered entry point", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => activeBootData(["test.orphan"]) });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(ModLoader, null, createElement("p", null, "Should not render")));
    expect(await screen.findByRole("alert")).toHaveTextContent("no loadable frontend entry was discovered");
    expect(bootControls.registerCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains registration failure and never reaches hydration", async () => {
    bootControls.registerError = new Error("fixture registration failed");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => activeBootData(["test.core"]) });
    vi.stubGlobal("fetch", fetchMock);
    const hydrate = vi.spyOn(ModRegistry.prototype, "hydrateFromBackend");
    render(createElement(ModLoader, null, createElement("p", null, "Should not render")));
    expect(await screen.findByRole("alert")).toHaveTextContent("fixture registration failed");
    expect(hydrate).not.toHaveBeenCalled();
    cleanup();
    render(createElement(ModLoader, null, createElement("p", null, "Still gated")));
    expect(await screen.findByRole("alert")).toHaveTextContent("fixture registration failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains Hydration failure and gates the application", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => activeBootData(["test.core"]) });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(ModRegistry.prototype, "hydrateFromBackend").mockImplementation(() => {
      throw new Error("backend Hydration failed");
    });
    render(createElement(ModLoader, null, createElement("p", null, "Should not render")));
    expect(await screen.findByRole("alert")).toHaveTextContent("backend Hydration failed");
    cleanup();
    render(createElement(ModLoader, null, createElement("p", null, "Still gated")));
    expect(await screen.findByRole("alert")).toHaveTextContent("backend Hydration failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Still gated")).not.toBeInTheDocument();
  });

  it("retains final registry validation failure and gates the application", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => activeBootData(["test.core"]) });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(ModRegistry.prototype, "validate").mockImplementation(() => {
      throw new Error("final registry validation failed");
    });
    render(createElement(ModLoader, null, createElement("p", null, "Should not render")));
    expect(await screen.findByRole("alert")).toHaveTextContent("final registry validation failed");
    cleanup();
    render(createElement(ModLoader, null, createElement("p", null, "Still gated")));
    expect(await screen.findByRole("alert")).toHaveTextContent("final registry validation failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Still gated")).not.toBeInTheDocument();
  });
});
