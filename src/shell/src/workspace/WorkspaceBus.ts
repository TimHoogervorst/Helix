/**
 * Event handler function signature for WorkspaceBus subscribers.
 *
 * Handlers may be sync or async. Return values are captured by
 * `collect()` and `request()` — `emit()` ignores them.
 */
export type EventHandler = (
  payload: unknown,
) => unknown | void | Promise<unknown | void>;

/**
 * Workspace-scoped event bus for decoupled communication between UI elements
 * across all slots in a workspace.
 *
 * The bus is pure logic — no React dependency, no registry dependency.
 * One bus instance per workspace, created by the workspace shell and passed
 * to every SlotRenderer.
 *
 * Three fire patterns:
 * - `emit()`  — fire-and-forget, return values ignored
 * - `collect()` — await all handlers, return array of results
 * - `request()` — first non-null result wins, short-circuits remaining handlers
 *
 * Handler errors never break other handlers or the bus itself.
 */
export class WorkspaceBus {
  private handlers: Array<{ event: string; handler: EventHandler }> = [];

  /**
   * Check whether a concrete event string matches a subscription pattern.
   *
   * Patterns may contain glob wildcards:
   * - `*` matches exactly one dot-delimited segment
   * - `**` matches zero or more dot-delimited segments
   *
   * When a pattern contains no wildcard characters, this reduces to an
   * exact string comparison — zero overhead for existing callers.
   */
  private matchesEvent(pattern: string, event: string): boolean {
    // Fast path: exact match for patterns without wildcards
    if (!pattern.includes("*")) {
      return pattern === event;
    }

    const patSegments = pattern.split(".");
    const evtSegments = event.split(".");

    const memo = new Map<string, boolean>();

    const dfs = (pi: number, ei: number): boolean => {
      const key = `${pi},${ei}`;
      const cached = memo.get(key);
      if (cached !== undefined) return cached;

      // Both exhausted — match
      if (pi === patSegments.length) {
        const result = ei === evtSegments.length;
        memo.set(key, result);
        return result;
      }

      const p = patSegments[pi];

      if (p === "**") {
        // ** matches zero or more event segments
        // Option 1: ** matches zero segments (skip **)
        if (dfs(pi + 1, ei)) {
          memo.set(key, true);
          return true;
        }
        // Option 2: ** matches one event segment (consume one, stay on **)
        if (ei < evtSegments.length && dfs(pi, ei + 1)) {
          memo.set(key, true);
          return true;
        }
        memo.set(key, false);
        return false;
      }

      // Event exhausted but pattern still has non-** segments
      if (ei === evtSegments.length) {
        memo.set(key, false);
        return false;
      }

      if (p === "*") {
        // * matches exactly one non-empty event segment
        if (evtSegments[ei] === "") {
          memo.set(key, false);
          return false;
        }
        const result = dfs(pi + 1, ei + 1);
        memo.set(key, result);
        return result;
      }

      // Literal match
      if (p === evtSegments[ei]) {
        const result = dfs(pi + 1, ei + 1);
        memo.set(key, result);
        return result;
      }

      memo.set(key, false);
      return false;
    };

    return dfs(0, 0);
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   *
   * The event string may contain glob wildcards (`*` for a single segment,
   * `**` for zero or more segments), enabling pattern-based subscriptions.
   * The same handler reference can be registered for multiple events.
   * Unsubscribing removes only the specific (event, handler) pair.
   */
  on(event: string, handler: EventHandler): () => void {
    const entry = { event, handler };
    this.handlers.push(entry);

    let unsubscribed = false;

    return () => {
      if (unsubscribed) return; // idempotent
      unsubscribed = true;
      const index = this.handlers.indexOf(entry);
      if (index !== -1) {
        this.handlers.splice(index, 1);
      }
    };
  }

  /**
   * Fire and forget. Delivers payload to all handlers whose subscription
   * pattern matches the emitted event. Handler return values are ignored.
   * Async handlers are fired but their promises are not awaited —
   * rejections are silently caught.
   */
  emit(event: string, payload?: unknown): void {
    // Snapshot handlers so unsubscribing during dispatch doesn't affect iteration
    const matching = this.handlers.filter((h) =>
      this.matchesEvent(h.event, event),
    );
    for (const entry of matching) {
      try {
        const result = entry.handler(payload);
        // Attach a catch to prevent unhandled promise rejections from async handlers
        if (result instanceof Promise) {
          result.catch(() => {});
        }
      } catch {
        // Sync handler errors don't break other handlers or the bus
      }
    }
  }

  /**
   * Fire and collect. Awaits all matching handlers (sync or async) and
   * returns an array of their return values in registration order.
   *
   * Matching is by subscription pattern — handlers registered with
   * wildcard patterns are included when the emitted event matches.
   * Handlers that throw are silently skipped — their results are omitted
   * from the returned array.
   */
  async collect<T = unknown>(
    event: string,
    payload?: unknown,
  ): Promise<T[]> {
    const matching = this.handlers.filter((h) =>
      this.matchesEvent(h.event, event),
    );
    const results: T[] = [];
    for (const entry of matching) {
      try {
        const result = await entry.handler(payload);
        results.push(result as T);
      } catch {
        // Handler errors don't break other handlers or the bus
      }
    }
    return results;
  }

  /**
   * Fire and return first non-null result. Awaits matching handlers in
   * registration order, short-circuiting on the first handler that returns
   * a non-null value.
   *
   * Matching is by subscription pattern — handlers registered with
   * wildcard patterns are included when the emitted event matches.
   * Returns null if no handler matches or all handlers return null/throw.
   */
  async request<T = unknown>(
    event: string,
    payload?: unknown,
  ): Promise<T | null> {
    const matching = this.handlers.filter((h) =>
      this.matchesEvent(h.event, event),
    );
    for (const entry of matching) {
      try {
        const result = await entry.handler(payload);
        if (result != null) {
          return result as T;
        }
      } catch {
        // Handler errors don't break other handlers or the bus
      }
    }
    return null;
  }
}

/**
 * Create a fresh WorkspaceBus instance for use in unit tests.
 *
 * This is a simple factory — no mocking, no special test behavior.
 * Tests use the real bus to verify external behavior (subscriptions,
 * event delivery, error isolation, etc.).
 */
export function createTestBus(): WorkspaceBus {
  return new WorkspaceBus();
}
