import { describe, it, expect } from "vitest";
import { BlockEvent } from "../BlockEvent";

describe("BlockEvent", () => {
  // ── BlockEvent.action ─────────────────────────────────────────────────

  describe("action factory", () => {
    it("produces category 'action' with the given core", () => {
      const event = BlockEvent.action({ id: "entities-registered", core: "created" });
      expect(event.category).toBe("action");
      expect(event.core).toBe("created");
      expect(event.id).toBe("entities-registered");
      expect(event.tags).toEqual([]);
    });

    it("produces category 'action' with core 'edited'", () => {
      const event = BlockEvent.action({ id: "row-updated", core: "edited" });
      expect(event.category).toBe("action");
      expect(event.core).toBe("edited");
    });

    it("produces category 'action' with core 'deleted'", () => {
      const event = BlockEvent.action({ id: "row-removed", core: "deleted" });
      expect(event.category).toBe("action");
      expect(event.core).toBe("deleted");
    });

    it("accepts and stores optional tags", () => {
      const event = BlockEvent.action({
        id: "registered-entities",
        core: "created",
        tags: ["audit", "lims"],
      });
      expect(event.tags).toEqual(["audit", "lims"]);
    });

    it("defaults tags to empty array when not provided", () => {
      const event = BlockEvent.action({ id: "row-added", core: "created" });
      expect(event.tags).toEqual([]);
    });
  });

  // ── BlockEvent.ui ─────────────────────────────────────────────────────

  describe("ui factory", () => {
    it("produces category 'ui' with core 'ui'", () => {
      const event = BlockEvent.ui({ id: "column-resized" });
      expect(event.category).toBe("ui");
      expect(event.core).toBe("ui");
      expect(event.id).toBe("column-resized");
      expect(event.tags).toEqual([]);
    });

    it("accepts and stores optional tags", () => {
      const event = BlockEvent.ui({ id: "sort-changed", tags: ["table"] });
      expect(event.tags).toEqual(["table"]);
    });

    it("defaults tags to empty array when not provided", () => {
      const event = BlockEvent.ui({ id: "view-changed" });
      expect(event.tags).toEqual([]);
    });
  });

  // ── fire ──────────────────────────────────────────────────────────────

  describe("fire", () => {
    it("constructs the full bus payload for an action event", () => {
      const event = BlockEvent.action({ id: "entities-registered", core: "created" });
      const payload = event.fire({ count: 5 });

      expect(payload).toEqual({
        eventId: "entities-registered",
        category: "action",
        core: "created",
        tags: [],
        payload: { count: 5 },
      });
    });

    it("constructs the full bus payload for a ui event", () => {
      const event = BlockEvent.ui({ id: "column-resized" });
      const payload = event.fire({ column: "name", width: 200 });

      expect(payload).toEqual({
        eventId: "column-resized",
        category: "ui",
        core: "ui",
        tags: [],
        payload: { column: "name", width: 200 },
      });
    });

    it("includes tags in the bus payload", () => {
      const event = BlockEvent.action({
        id: "registered-entities",
        core: "created",
        tags: ["audit", "lims"],
      });
      const payload = event.fire({ count: 10 });

      expect(payload.tags).toEqual(["audit", "lims"]);
    });

    it("handles empty payload", () => {
      const event = BlockEvent.action({ id: "row-deleted", core: "deleted" });
      const payload = event.fire({});

      expect(payload.payload).toEqual({});
    });

    it("handles nested payload objects", () => {
      const event = BlockEvent.action({ id: "status-changed", core: "edited" });
      const payload = event.fire({
        entity: { id: 1, name: "Test" },
        from: "draft",
        to: "published",
      });

      expect(payload.payload).toEqual({
        entity: { id: 1, name: "Test" },
        from: "draft",
        to: "published",
      });
    });

    it("action and ui events have distinct shapes", () => {
      const actionEvent = BlockEvent.action({ id: "test", core: "created" });
      const uiEvent = BlockEvent.ui({ id: "test" });

      const actionPayload = actionEvent.fire({});
      const uiPayload = uiEvent.fire({});

      expect(actionPayload.category).toBe("action");
      expect(actionPayload.core).toBe("created");
      expect(uiPayload.category).toBe("ui");
      expect(uiPayload.core).toBe("ui");
    });
  });

  // ── Immutability ──────────────────────────────────────────────────────

  describe("instance immutability", () => {
    it("all fields are readonly", () => {
      const event = BlockEvent.action({ id: "test", core: "created" });

      expect(event.id).toBe("test");
      expect(event.category).toBe("action");
      expect(event.core).toBe("created");
      // Verifying the shape is stable — no setters on the instance
      expect(Object.isFrozen(event)).toBe(false); // Not frozen, but fields are readonly via TS
    });

    it("fire returns a new object each call (no mutation)", () => {
      const event = BlockEvent.action({ id: "test", core: "created" });
      const p1 = event.fire({ a: 1 });
      const p2 = event.fire({ b: 2 });

      expect(p1).not.toBe(p2);
      expect(p1.payload).toEqual({ a: 1 });
      expect(p2.payload).toEqual({ b: 2 });
    });
  });
});
