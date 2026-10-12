import { describe, expect, it } from "vitest";
import { parseJsonManifest, topologicalSort, type ModModule } from "../ModLoader";

const manifest = (id: string, dependsOn: { id: string; version: string }[] = []) => ({
  id,
  displayName: id,
  version: "1.0.0",
  requiresHelix: ">=1.0.0",
  artifacts: ["frontend", "backend"] as ("frontend" | "backend")[],
  dependsOn,
});

describe("strict Mod manifest loading", () => {
  it("parses canonical identity and dependency objects", () => {
    const result = parseJsonManifest(manifest("acme.consumer", [{ id: "helix.core", version: "^1.0.0" }]), "fixture");
    expect(result.id).toBe("acme.consumer");
    expect(result.dependsOn[0]).toEqual({ id: "helix.core", version: "^1.0.0" });
  });

  it("rejects legacy and unknown properties", () => {
    expect(() => parseJsonManifest({ ...manifest("acme.mod"), vendor: "acme" }, "fixture")).toThrow();
    expect(() => parseJsonManifest({ ...manifest("acme.mod"), coreVersion: "1.0.0" }, "fixture")).toThrow();
    expect(() => parseJsonManifest({ ...manifest("acme.mod"), artifacts: ["fullstack"] }, "fixture")).toThrow();
  });

  it("sorts canonical dependency IDs", () => {
    const a: ModModule = { meta: manifest("acme.a", [{ id: "acme.b", version: "^1.0.0" }]), register: () => {} };
    const b: ModModule = { meta: manifest("acme.b"), register: () => {} };
    expect(topologicalSort([a, b]).map((mod) => mod.meta!.id)).toEqual(["acme.b", "acme.a"]);
  });
});
