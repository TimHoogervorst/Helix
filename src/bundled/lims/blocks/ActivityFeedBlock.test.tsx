import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFeedBlock } from "./ActivityFeedBlock";
import { mapLimsAction } from "../hooks/useActivity";
import type { LimsAction } from "../types";

vi.mock("../hooks/useActivity", async () => {
  const actual = await vi.importActual<typeof import("../hooks/useActivity")>(
    "../hooks/useActivity",
  );
  return {
    ...actual,
    useLimsActivity: () => ({
      actions: [],
      items: [],
      isLoading: false,
      isLoadingMore: false,
      error: null,
      hasMore: false,
      refetch: vi.fn(),
      loadMore: vi.fn(),
    }),
  };
});

const action: LimsAction = {
  id: 7,
  action: "lims.entity.edited",
  action_type: "edited",
  target_type: "lims.entity",
  target_id: 42,
  request_id: "request-1",
  metadata: {},
  created_at: "2026-08-27T12:00:00Z",
  performed_by: {
    id: 1,
    username: "mira",
    first_name: "Mira",
    last_name: "Keller",
    color: "#d9b3e6",
  },
};

describe("ActivityFeedBlock", () => {
  it("maps a LIMS action into the shared feed shape", () => {
    expect(mapLimsAction(action)).toEqual({
      id: 7,
      action: "lims.entity.edited",
      actionType: "edited",
      targetType: "lims.entity",
      targetId: 42,
      requestId: "request-1",
      metadata: {},
      createdAt: "2026-08-27T12:00:00Z",
      state: "confirmed",
      performedBy: {
        id: 1,
        username: "mira",
        firstName: "Mira",
        lastName: "Keller",
        color: "#d9b3e6",
      },
    });
  });

  it("renders actions whose performer has been deleted", () => {
    expect(mapLimsAction({ ...action, performed_by: null }).performedBy).toEqual({
      id: 0,
      username: "Unknown user",
      firstName: "",
      lastName: "",
      color: "",
    });
  });

  it("renders without an event bus", () => {
    render(
      <ActivityFeedBlock
        context={{
          workspaceId: "lims",
          user: null,
          viewMode: "view",
          entityId: "42",
        }}
        instance={{
          id: "activity",
          blockId: "lims.activity-feed",
          slotId: "lims.entity-workspace",
          attrs: {},
          updateAttrs: vi.fn(),
        }}
        overrides={{}}
      />,
    );

    expect(screen.getByTestId("activity-empty")).toBeInTheDocument();
  });
});
