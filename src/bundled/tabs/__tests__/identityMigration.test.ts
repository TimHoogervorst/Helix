import { describe, expect, it } from "vitest";
import { migrateWorkspaceHistoryItem, UnknownPersistedIdentity } from "../identityMigration";

describe("persisted workspace history migration", () => {
  it("adds an explicit workspace reference and canonical URL", () => {
    expect(migrateWorkspaceHistoryItem({
      displayId: "E7",
      name: "Entry",
      url: "/eln/E7?tab=history",
      icon: "eln",
    })).toEqual({
      displayId: "E7",
      name: "Entry",
      url: "/w/helix/eln/workspace/E7?tab=history",
      icon: "eln",
      workspaceReference: "helix.eln:workspace",
    });
  });

  it("fails unknown URL namespaces instead of guessing", () => {
    expect(() => migrateWorkspaceHistoryItem({
      displayId: "X1", name: "Unknown", url: "/future/X1", icon: "",
    })).toThrow(UnknownPersistedIdentity);
  });
});
