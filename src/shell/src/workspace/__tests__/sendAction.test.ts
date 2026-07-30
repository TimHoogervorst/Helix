import { describe, it, expect, vi, afterEach } from "vitest";
import { createSendAction } from "../sendAction";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Restore global fetch after each test that mocks it. */
function withFetch(
  mock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn().mockImplementation(mock) as unknown as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("createSendAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a POST to /api/actions/ with the correct body", async () => {
    let capturedBody: string | null = null;

    await withFetch(async (_input, init) => {
      capturedBody = init?.body as string;
      return new Response("[]", { status: 201 });
    }, async () => {
      const sendAction = createSendAction("eln");
      await sendAction("eln.entry.created", "eln.entry", 42);
    });

    expect(capturedBody).not.toBeNull();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed).toEqual({
      action: "eln.entry.created",
      action_type: "created",
      target_type: "eln.entry",
      target_id: 42,
      workspace_id: "eln",
    });
  });

  it("includes metadata when provided", async () => {
    let capturedBody: string | null = null;

    await withFetch(async (_input, init) => {
      capturedBody = init?.body as string;
      return new Response("[]", { status: 201 });
    }, async () => {
      const sendAction = createSendAction("eln");
      await sendAction("eln.entry.edited", "eln.entry", 42, {
        old_status: "draft",
        new_status: "published",
      });
    });

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.metadata).toEqual({
      old_status: "draft",
      new_status: "published",
    });
  });

  it("omits metadata from body when not provided", async () => {
    let capturedBody: string | null = null;

    await withFetch(async (_input, init) => {
      capturedBody = init?.body as string;
      return new Response("[]", { status: 201 });
    }, async () => {
      const sendAction = createSendAction("eln");
      await sendAction("eln.entry.created", "eln.entry", 42);
    });

    const parsed = JSON.parse(capturedBody!);
    // metadata should not be in the body when not provided
    expect(parsed).not.toHaveProperty("metadata");
  });

  it("uses the correct Content-Type header", async () => {
    let capturedHeaders: Record<string, string> = {};

    await withFetch(async (_input, init) => {
      const h = init?.headers;
      if (h && typeof h === "object" && !Array.isArray(h)) {
        capturedHeaders = { ...h } as Record<string, string>;
      }
      return new Response("[]", { status: 201 });
    }, async () => {
      const sendAction = createSendAction("eln");
      await sendAction("eln.entry.created", "eln.entry", 42);
    });

    expect(capturedHeaders["Content-Type"]).toBe("application/json");
  });

  it("attaches X-CSRFToken header when csrftoken cookie is present", async () => {
    // Set a fake csrftoken cookie
    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "csrftoken=fake-csrf-token-123; other=value",
    });

    let capturedHeaders: Record<string, string> = {};

    await withFetch(async (_input, init) => {
      const h = init?.headers;
      if (h && typeof h === "object" && !Array.isArray(h)) {
        capturedHeaders = { ...h } as Record<string, string>;
      }
      return new Response("[]", { status: 201 });
    }, async () => {
      const sendAction = createSendAction("eln");
      await sendAction("eln.entry.created", "eln.entry", 42);
    });

    expect(capturedHeaders["X-CSRFToken"]).toBe("fake-csrf-token-123");

    // Clean up
    Object.defineProperty(document, "cookie", { writable: true, value: "" });
  });

  it("omits X-CSRFToken header when csrftoken cookie is absent", async () => {
    // Ensure no csrftoken cookie is set
    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "other=value",
    });

    let capturedHeaders: Record<string, string> = {};

    await withFetch(async (_input, init) => {
      const h = init?.headers;
      if (h && typeof h === "object" && !Array.isArray(h)) {
        capturedHeaders = { ...h } as Record<string, string>;
      }
      return new Response("[]", { status: 201 });
    }, async () => {
      const sendAction = createSendAction("eln");
      await sendAction("eln.entry.created", "eln.entry", 42);
    });

    expect(capturedHeaders).not.toHaveProperty("X-CSRFToken");

    // Clean up
    Object.defineProperty(document, "cookie", { writable: true, value: "" });
  });

  it("throws on non-2xx response", async () => {
    await withFetch(async () => {
      return new Response("Unknown action type", { status: 400 });
    }, async () => {
      const sendAction = createSendAction("eln");
      await expect(
        sendAction("eln.entry.bad-action", "eln.entry", 42),
      ).rejects.toThrow("sendAction failed (400)");
    });
  });

  it("uses different workspace IDs for different workspaces", async () => {
    const capturedWorkspaceIds: string[] = [];

    await withFetch(async (_input, init) => {
      const body = JSON.parse(init?.body as string);
      capturedWorkspaceIds.push(body.workspace_id);
      return new Response("[]", { status: 201 });
    }, async () => {
      const sendActionEln = createSendAction("eln");
      const sendActionLims = createSendAction("lims");

      await sendActionEln("eln.entry.created", "eln.entry", 1);
      await sendActionLims("lims.entity.created", "lims.entity", 2);
    });

    expect(capturedWorkspaceIds).toEqual(["eln", "lims"]);
  });

  it("includes request_id in body when requestId is passed", async () => {
    let capturedBody: string | null = null;

    await withFetch(async (_input, init) => {
      capturedBody = init?.body as string;
      return new Response("[]", { status: 201 });
    }, async () => {
      const sendAction = createSendAction("eln");
      await sendAction(
        "eln.table.edited",
        "eln.entry",
        42,
        { message: "Edited a table" },
        "550e8400-e29b-41d4-a716-446655440000",
      );
    });

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.request_id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("omits request_id from body when requestId is not provided", async () => {
    let capturedBody: string | null = null;

    await withFetch(async (_input, init) => {
      capturedBody = init?.body as string;
      return new Response("[]", { status: 201 });
    }, async () => {
      const sendAction = createSendAction("eln");
      await sendAction("eln.entry.created", "eln.entry", 42);
    });

    const parsed = JSON.parse(capturedBody!);
    expect(parsed).not.toHaveProperty("request_id");
  });
});
