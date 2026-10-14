// @vitest-environment node
import { describe, expect, it } from "vitest";
import { migrateWorkspaceHistoryItem, UnknownPersistedIdentity } from "../identityMigration";

describe("persisted workspace history migration", () => {
  it("adds an explicit workspace reference and canonical URL", () => {
    expect(migrateWorkspaceHistoryItem({
      displayId: "B7",
      name: "Entity",
      url: "/lims/B7?tab=history",
      icon: "lims",
    })).toEqual({
      displayId: "B7",
      name: "Entity",
      url: "/w/helix/lims/workspace/B7?tab=history",
      icon: "lims",
      workspaceReference: "helix.lims:workspace",
    });
  });

  it("fails unknown URL namespaces instead of guessing", () => {
    expect(() => migrateWorkspaceHistoryItem({
      displayId: "X1", name: "Unknown", url: "/future/X1", icon: "",
    })).toThrow(UnknownPersistedIdentity);
  });
});
