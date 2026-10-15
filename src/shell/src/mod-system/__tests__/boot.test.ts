import { describe, expect, it } from "vitest";
import { runFrontendBoot, type FrontendBootOperations } from "../boot";

function operations(events: string[]): FrontendBootOperations {
  return {
    readBootData: async () => {
      events.push("boot-data");
      return { activeMods: ["helix.example"] };
    },
    importActive: async () => {
      events.push("import");
      return { "helix.example": {} };
    },
    registerActive: () => events.push("register"),
    resolveFrontend: () => events.push("resolve"),
  };
}

describe("frontend maintenance-window boot", () => {
  it("imports, registers, and resolves only after boot data is available", async () => {
    const events: string[] = [];

    await runFrontendBoot(operations(events));

    expect(events).toEqual(["boot-data", "import", "register", "resolve"]);
  });

  it("does not import or register when boot data fails", async () => {
    const events: string[] = [];
    const boot = operations(events);
    boot.readBootData = async () => {
      events.push("boot-data");
      throw new Error("backend boot failed");
    };

    await expect(runFrontendBoot(boot)).rejects.toThrow("backend boot failed");
    expect(events).toEqual(["boot-data"]);
  });
});
