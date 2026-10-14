// @vitest-environment node
import { describe, expect, it } from "vitest";
import { viewFilterState } from "../types";

describe("saved view source specifications", () => {
  it("restores filters from the portable spec instead of legacy filter_state", () => {
    expect(viewFilterState({
      spec: {
        filter: { search: "portable", status: "active", fields: ["name"] },
        sort: [{ field: "name" }],
        columns: ["display_id", "name"],
      },
      filter_state: {
        search: "legacy",
        schema_type: "",
        schema: "",
        status: "",
        sort: "",
        fields: [],
        columns: [],
        viewMode: "compact",
      },
    })).toEqual({
      search: "portable",
      schema_type: "",
      schema: "",
      status: "active",
      sort: "name",
      fields: ["name"],
      columns: ["display_id", "name"],
      viewMode: "compact",
    });
  });
});
