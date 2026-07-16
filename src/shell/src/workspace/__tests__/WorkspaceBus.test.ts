import { describe, it, expect, vi } from "vitest";
import { WorkspaceBus, createTestBus } from "../WorkspaceBus";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Create a fresh bus for each test. */
function freshBus(): WorkspaceBus {
  return createTestBus();
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("WorkspaceBus", () => {
  // ── createTestBus ─────────────────────────────────────────────────────

  describe("createTestBus", () => {
    it("returns a WorkspaceBus instance", () => {
      const bus = createTestBus();
      expect(bus).toBeInstanceOf(WorkspaceBus);
    });

    it("each call returns a fresh, independent instance", () => {
      const bus1 = createTestBus();
      const bus2 = createTestBus();

      const handler = vi.fn();
      bus1.on("test.event", handler);
      bus2.emit("test.event", { data: 1 });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── on() ──────────────────────────────────────────────────────────────

  describe("on", () => {
    it("returns an unsubscribe function", () => {
      const bus = freshBus();
      const unsubscribe = bus.on("test.event", () => {});
      expect(typeof unsubscribe).toBe("function");
    });

    it("calling unsubscribe multiple times is idempotent", () => {
      const bus = freshBus();
      const handler = vi.fn();
      const unsubscribe = bus.on("test.event", handler);

      unsubscribe();
      unsubscribe();
      unsubscribe();

      bus.emit("test.event");
      expect(handler).not.toHaveBeenCalled();
    });

    it("same handler can be registered for different events", () => {
      const bus = freshBus();
      const handler = vi.fn();

      bus.on("event.a", handler);
      bus.on("event.b", handler);

      bus.emit("event.a");
      expect(handler).toHaveBeenCalledTimes(1);

      bus.emit("event.b");
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("unsubscribing from one event does not affect the same handler on another event", () => {
      const bus = freshBus();
      const handler = vi.fn();

      const unsubA = bus.on("event.a", handler);
      bus.on("event.b", handler);

      unsubA();

      bus.emit("event.a");
      expect(handler).not.toHaveBeenCalled();

      bus.emit("event.b");
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── emit() ────────────────────────────────────────────────────────────

  describe("emit", () => {
    it("delivers to all matching handlers", () => {
      const bus = freshBus();
      const h1 = vi.fn();
      const h2 = vi.fn();
      const h3 = vi.fn();

      bus.on("test.event", h1);
      bus.on("test.event", h2);
      bus.on("other.event", h3);

      bus.emit("test.event", { data: 42 });

      expect(h1).toHaveBeenCalledWith({ data: 42 });
      expect(h2).toHaveBeenCalledWith({ data: 42 });
      expect(h3).not.toHaveBeenCalled();
    });

    it("does not deliver to handlers for different events", () => {
      const bus = freshBus();
      const handler = vi.fn();

      bus.on("event.a", handler);
      bus.emit("event.b");

      expect(handler).not.toHaveBeenCalled();
    });

    it("ignores handler return values", () => {
      const bus = freshBus();
      const handler = vi.fn(() => "ignored");
      bus.on("test.event", handler);

      const result = bus.emit("test.event");

      expect(result).toBeUndefined();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not await async handlers (fire-and-forget)", () => {
      const bus = freshBus();
      let resolved = false;
      const handler = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              resolved = true;
              resolve();
            }, 10);
          }),
      );

      bus.on("test.event", handler);
      bus.emit("test.event");

      // emit is synchronous — async handler hasn't resolved yet
      expect(resolved).toBe(false);
    });

    it("works with undefined payload", () => {
      const bus = freshBus();
      const handler = vi.fn();

      bus.on("test.event", handler);
      bus.emit("test.event");

      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it("handlers are called in registration order", () => {
      const bus = freshBus();
      const order: number[] = [];

      bus.on("test.event", () => order.push(1));
      bus.on("test.event", () => order.push(2));
      bus.on("test.event", () => order.push(3));

      bus.emit("test.event");

      expect(order).toEqual([1, 2, 3]);
    });

    it("unsubscribing during dispatch does not affect current iteration", () => {
      const bus = freshBus();
      let unsub: () => void;

      const h1 = vi.fn();
      const h2 = vi.fn(() => {
        unsub();
      });
      const h3 = vi.fn();

      unsub = bus.on("test.event", h1);
      bus.on("test.event", h2);
      bus.on("test.event", h3);

      bus.emit("test.event");

      // All three were in the snapshot — all should be called
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
      expect(h3).toHaveBeenCalledTimes(1);

      // But on next emit, h1 should not be called
      bus.emit("test.event");
      expect(h1).toHaveBeenCalledTimes(1); // still 1
      expect(h2).toHaveBeenCalledTimes(2);
      expect(h3).toHaveBeenCalledTimes(2);
    });
  });

  // ── collect() ─────────────────────────────────────────────────────────

  describe("collect", () => {
    it("gathers return values from all matching handlers", async () => {
      const bus = freshBus();

      bus.on("test.event", () => "a");
      bus.on("test.event", () => "b");
      bus.on("test.event", () => "c");

      const results = await bus.collect("test.event");

      expect(results).toEqual(["a", "b", "c"]);
    });

    it("returns empty array when no handlers match", async () => {
      const bus = freshBus();

      bus.on("other.event", () => "x");
      const results = await bus.collect("test.event");

      expect(results).toEqual([]);
    });

    it("awaits async handlers", async () => {
      const bus = freshBus();

      bus.on("test.event", () => Promise.resolve("async"));
      bus.on("test.event", () => "sync");

      const results = await bus.collect("test.event");

      expect(results).toEqual(["async", "sync"]);
    });

    it("passes payload to handlers", async () => {
      const bus = freshBus();
      const handler = vi.fn((p: unknown) => p);

      bus.on("test.event", handler);
      await bus.collect("test.event", { key: "value" });

      expect(handler).toHaveBeenCalledWith({ key: "value" });
    });

    it("handlers are called in registration order — results preserve order", async () => {
      const bus = freshBus();

      bus.on("test.event", () => 1);
      bus.on("test.event", () => 2);
      bus.on("test.event", () => 3);

      const results = await bus.collect("test.event");

      expect(results).toEqual([1, 2, 3]);
    });

    it("handler errors are silently skipped — other results preserved", async () => {
      const bus = freshBus();

      bus.on("test.event", () => "first");
      bus.on("test.event", () => {
        throw new Error("boom");
      });
      bus.on("test.event", () => "third");

      const results = await bus.collect("test.event");

      expect(results).toEqual(["first", "third"]);
    });

    it("async handler rejections are silently skipped", async () => {
      const bus = freshBus();

      bus.on("test.event", () => Promise.resolve("first"));
      bus.on("test.event", () => Promise.reject(new Error("async boom")));
      bus.on("test.event", () => "third");

      const results = await bus.collect("test.event");

      expect(results).toEqual(["first", "third"]);
    });

    it("does not deliver to unsubscribed handlers", async () => {
      const bus = freshBus();
      const handler = vi.fn(() => "removed");

      const unsubscribe = bus.on("test.event", handler);
      unsubscribe();

      const results = await bus.collect("test.event");

      expect(results).toEqual([]);
      expect(handler).not.toHaveBeenCalled();
    });

    it("handles explicit null payload", async () => {
      const bus = freshBus();
      const handler = vi.fn((p: unknown) => p);

      bus.on("test.event", handler);
      const results = await bus.collect("test.event", null);

      expect(handler).toHaveBeenCalledWith(null);
      expect(results).toEqual([null]);
    });
  });

  // ── request() ─────────────────────────────────────────────────────────

  describe("request", () => {
    it("returns first non-null handler result", async () => {
      const bus = freshBus();

      bus.on("test.event", () => "first");
      bus.on("test.event", () => "second");

      const result = await bus.request("test.event");

      expect(result).toBe("first");
    });

    it("skips handlers that return null", async () => {
      const bus = freshBus();
      const secondHandler = vi.fn(() => "second");

      bus.on("test.event", () => null);
      bus.on("test.event", secondHandler);

      const result = await bus.request("test.event");

      expect(result).toBe("second");
      expect(secondHandler).toHaveBeenCalledTimes(1);
    });

    it("skips handlers that return undefined", async () => {
      const bus = freshBus();
      const secondHandler = vi.fn(() => "second");

      bus.on("test.event", () => undefined);
      bus.on("test.event", secondHandler);

      const result = await bus.request("test.event");

      expect(result).toBe("second");
    });

    it("short-circuits — does not call remaining handlers after first non-null", async () => {
      const bus = freshBus();
      const h1 = vi.fn(() => "first");
      const h2 = vi.fn(() => "should not be called");

      bus.on("test.event", h1);
      bus.on("test.event", h2);

      await bus.request("test.event");

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).not.toHaveBeenCalled();
    });

    it("skips handlers that throw", async () => {
      const bus = freshBus();
      const secondHandler = vi.fn(() => "second");

      bus.on("test.event", () => {
        throw new Error("boom");
      });
      bus.on("test.event", secondHandler);

      const result = await bus.request("test.event");

      expect(result).toBe("second");
      expect(secondHandler).toHaveBeenCalledTimes(1);
    });

    it("skips async handlers that reject", async () => {
      const bus = freshBus();
      const secondHandler = vi.fn(() => "second");

      bus.on("test.event", () => Promise.reject(new Error("async boom")));
      bus.on("test.event", secondHandler);

      const result = await bus.request("test.event");

      expect(result).toBe("second");
    });

    it("returns null when no handlers match", async () => {
      const bus = freshBus();

      bus.on("other.event", () => "x");
      const result = await bus.request("test.event");

      expect(result).toBeNull();
    });

    it("returns null when all handlers return null/undefined", async () => {
      const bus = freshBus();

      bus.on("test.event", () => null);
      bus.on("test.event", () => undefined);

      const result = await bus.request("test.event");

      expect(result).toBeNull();
    });

    it("short-circuits on falsy-but-not-nullish returns (0, false, empty string)", async () => {
      const bus = freshBus();

      bus.on("test.event", () => 0 as unknown);
      bus.on("test.event", () => "should not be called");

      const result = await bus.request("test.event");
      expect(result).toBe(0);

      const bus2 = freshBus();
      bus2.on("test.event", () => false as unknown);
      bus2.on("test.event", () => "should not be called");
      expect(await bus2.request("test.event")).toBe(false);

      const bus3 = freshBus();
      bus3.on("test.event", () => "" as unknown);
      bus3.on("test.event", () => "should not be called");
      expect(await bus3.request("test.event")).toBe("");
    });

    it("returns null when all handlers throw", async () => {
      const bus = freshBus();

      bus.on("test.event", () => {
        throw new Error("all fail");
      });

      const result = await bus.request("test.event");

      expect(result).toBeNull();
    });

    it("awaits async handlers and short-circuits correctly", async () => {
      const bus = freshBus();
      let secondCalled = false;

      bus.on("test.event", () => Promise.resolve("async-result"));
      bus.on("test.event", () => {
        secondCalled = true;
        return "should-not-reach";
      });

      const result = await bus.request("test.event");

      expect(result).toBe("async-result");
      expect(secondCalled).toBe(false);
    });

    it("passes payload to handlers", async () => {
      const bus = freshBus();
      const handler = vi.fn((p: unknown) => p);

      bus.on("test.event", handler);
      const result = await bus.request("test.event", { key: "value" });

      expect(handler).toHaveBeenCalledWith({ key: "value" });
      expect(result).toEqual({ key: "value" });
    });

    it("handles explicit null payload", async () => {
      const bus = freshBus();
      const handler = vi.fn(() => "result");

      bus.on("test.event", handler);
      const result = await bus.request("test.event", null);

      expect(handler).toHaveBeenCalledWith(null);
      expect(result).toBe("result");
    });
  });

  // ── Unsubscribe ───────────────────────────────────────────────────────

  describe("unsubscribe", () => {
    it("removes handler from future events", () => {
      const bus = freshBus();
      const handler = vi.fn();

      const unsubscribe = bus.on("test.event", handler);
      unsubscribe();
      bus.emit("test.event");

      expect(handler).not.toHaveBeenCalled();
    });

    it("only removes the specific handler — other handlers for same event remain", () => {
      const bus = freshBus();
      const h1 = vi.fn();
      const h2 = vi.fn();

      const unsub1 = bus.on("test.event", h1);
      bus.on("test.event", h2);

      unsub1();
      bus.emit("test.event");

      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it("unsubscribed handler is not called by emit", () => {
      const bus = freshBus();
      const handler = vi.fn();

      const unsubscribe = bus.on("test.event", handler);
      unsubscribe();
      bus.emit("test.event", { data: 1 });

      expect(handler).not.toHaveBeenCalled();
    });

    it("unsubscribed handler is not called by collect", async () => {
      const bus = freshBus();
      const handler = vi.fn(() => "value");

      const unsubscribe = bus.on("test.event", handler);
      unsubscribe();
      const results = await bus.collect("test.event");

      expect(results).toEqual([]);
      expect(handler).not.toHaveBeenCalled();
    });

    it("unsubscribed handler is not called by request", async () => {
      const bus = freshBus();
      const handler = vi.fn(() => "value");

      const unsubscribe = bus.on("test.event", handler);
      unsubscribe();
      const result = await bus.request("test.event");

      expect(result).toBeNull();
      expect(handler).not.toHaveBeenCalled();
    });

    it("unsubscribing during collect dispatch does not affect current iteration", async () => {
      const bus = freshBus();
      let unsub: () => void;

      const h1 = vi.fn(() => {
        unsub();
        return "first";
      });
      const h2 = vi.fn(() => "second");

      unsub = bus.on("test.event", h1);
      bus.on("test.event", h2);

      const results = await bus.collect("test.event");

      // Both were in the snapshot — both should be called
      expect(results).toEqual(["first", "second"]);
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);

      // On next collect, h1 should not be called
      const results2 = await bus.collect("test.event");
      expect(results2).toEqual(["second"]);
      expect(h1).toHaveBeenCalledTimes(1); // still 1
    });

    it("unsubscribing during request dispatch does not affect current iteration", async () => {
      const bus = freshBus();
      let unsub: () => void;
      let secondCalled = false;

      const h1 = vi.fn(() => {
        unsub();
        return null; // no answer — let h2 try
      });
      const h2 = vi.fn(() => {
        secondCalled = true;
        return "second";
      });

      unsub = bus.on("test.event", h1);
      bus.on("test.event", h2);

      const result = await bus.request("test.event");

      // h1 returned null, so request continued to h2
      expect(result).toBe("second");
      expect(secondCalled).toBe(true);

      // On next request, h1 should not be called
      await bus.request("test.event");
      expect(h1).toHaveBeenCalledTimes(1); // only from first dispatch
    });
  });

  // ── Error isolation ───────────────────────────────────────────────────

  describe("error isolation", () => {
    it("sync handler error in emit does not prevent other handlers", () => {
      const bus = freshBus();
      const h2 = vi.fn();

      bus.on("test.event", () => {
        throw new Error("boom");
      });
      bus.on("test.event", h2);

      expect(() => bus.emit("test.event")).not.toThrow();
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it("sync handler error in collect does not prevent other handlers", async () => {
      const bus = freshBus();
      const h2 = vi.fn(() => "survived");

      bus.on("test.event", () => {
        throw new Error("boom");
      });
      bus.on("test.event", h2);

      const results = await bus.collect("test.event");

      expect(results).toEqual(["survived"]);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it("sync handler error in request does not prevent other handlers", async () => {
      const bus = freshBus();
      const h2 = vi.fn(() => "survived");

      bus.on("test.event", () => {
        throw new Error("boom");
      });
      bus.on("test.event", h2);

      const result = await bus.request("test.event");

      expect(result).toBe("survived");
    });

    it("async handler rejection in emit is silently caught (no unhandled rejection)", () => {
      const bus = freshBus();
      const h2 = vi.fn();

      bus.on("test.event", () => Promise.reject(new Error("async boom")));
      bus.on("test.event", h2);

      // Should not throw — rejection is caught via .catch()
      expect(() => bus.emit("test.event")).not.toThrow();
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it("async handler rejection in collect does not affect other results", async () => {
      const bus = freshBus();

      bus.on("test.event", () => Promise.reject(new Error("async boom")));
      bus.on("test.event", () => Promise.resolve("survived"));

      const results = await bus.collect("test.event");

      expect(results).toEqual(["survived"]);
    });
  });

  // ── Event string matching ─────────────────────────────────────────────

  describe("event matching", () => {
    it("uses exact string match — no wildcards or regex", () => {
      const bus = freshBus();
      const handler = vi.fn();

      bus.on("eln.table.edited", handler);

      bus.emit("eln.table");
      expect(handler).not.toHaveBeenCalled();

      bus.emit("eln.table.edited.extra");
      expect(handler).not.toHaveBeenCalled();

      bus.emit("eln.table.edited");
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("same handler subscribed twice for the same event fires twice", () => {
      const bus = freshBus();
      const handler = vi.fn();

      bus.on("test.event", handler);
      bus.on("test.event", handler);

      bus.emit("test.event");

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("unsubscribing one registration of a duplicate handler only removes that one", () => {
      const bus = freshBus();
      const handler = vi.fn();

      bus.on("test.event", handler);
      const unsub = bus.on("test.event", handler);

      unsub();
      bus.emit("test.event");

      // Only one of the two registrations was removed
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── Bus independence ──────────────────────────────────────────────────

  describe("bus independence", () => {
    it("two bus instances do not share handlers", () => {
      const bus1 = createTestBus();
      const bus2 = createTestBus();
      const handler = vi.fn();

      bus1.on("test.event", handler);
      bus2.emit("test.event");

      expect(handler).not.toHaveBeenCalled();
    });

    it("events on one bus instance do not leak to another", () => {
      const bus1 = createTestBus();
      const bus2 = createTestBus();
      const h1 = vi.fn();
      const h2 = vi.fn();

      bus1.on("test.event", h1);
      bus2.on("test.event", h2);

      bus1.emit("test.event", "from bus1");

      expect(h1).toHaveBeenCalledWith("from bus1");
      expect(h2).not.toHaveBeenCalled();
    });
  });

  // ── Triple-dotted event naming (spec convention) ──────────────────────

  describe("event naming convention", () => {
    it("supports triple-dotted event names per the spec", () => {
      const bus = freshBus();
      const handler = vi.fn();

      bus.on("eln.table.created", handler);
      bus.emit("eln.table.created", { blockId: "t1" });

      expect(handler).toHaveBeenCalledWith({ blockId: "t1" });
    });

    it("supports cross-mod event names", () => {
      const bus = freshBus();
      const results: string[] = [];

      bus.on("data.export", () => results.push("table"));
      bus.on("data.export", () => results.push("chart"));
      bus.emit("data.export");

      expect(results).toEqual(["table", "chart"]);
    });
  });
});
