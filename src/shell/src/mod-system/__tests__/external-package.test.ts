import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { ModLoader } from "../ModLoader";
import { ModRegistry } from "../ModRegistry";

vi.mock("../external", () => ({
  externalJsonManifestModules: import.meta.glob("../../../../helix_core/tests/fixtures/external_mod/modManifest.json", { eager: true }),
  externalModLoaders: import.meta.glob("../../../../helix_core/tests/fixtures/external_mod/index.ts"),
}));
vi.mock("../bundled", () => ({
  bundledJsonManifestModules: { "core/modManifest.json": { default: { id: "test.core", displayName: "Core", version: "1.0.0", requiresHelix: ">=1.0.0", artifacts: ["frontend"], dependsOn: [] } } },
  bundledModModules: { "core/index.ts": { register: () => {} } },
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); ModRegistry._reset(); });

describe("external package discovery", () => {
  it.each([
    { activeMods: ["test.core", "test.external"], hubs: ["test.external:content"] },
    { activeMods: ["test.core"], hubs: [] },
  ])("boots package contributions for active set $activeMods", async ({ activeMods, hubs }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ activeMods, registry: {} }) }));
    render(createElement(ModLoader, null, createElement("p", null, "Booted")));
    await screen.findByText("Booted");
    await waitFor(() => expect([...ModRegistry.getInstance().getHubs().keys()]).toEqual(hubs));
    if (hubs.length) {
      const hub = ModRegistry.getInstance().getHubs().get(hubs[0])!;
      render(createElement(hub.component));
      expect(screen.getByText("Fixture content")).toBeInTheDocument();
    }
  });
});
