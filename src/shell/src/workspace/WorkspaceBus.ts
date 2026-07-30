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
 * Payload shape emitted by BlockNodeView for block lifecycle events
 * (`{blockId}.created`, `{blockId}.edited`, `{blockId}.deleted`).
 *
 * Shared contract between the emitter (BlockNodeView) and all consumers
 * (ActivityFeedBlock, useActionAccumulator, etc.).
 */
export interface BlockLifecyclePayload {
  blockId: string;
  slotId: string;
  blockInstanceId: string;
  /** Present on created and edited events. */
  attrs?: Record<string, unknown>;
  /** Present on edited events (the changed fields only). */
  changedAttrs?: Record<string, unknown>;
}

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
   * Subscribe to an event. Returns an unsubscribe function.
   *
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
   * Fire and forget. Delivers payload to all matching handlers.
   * Handler return values are ignored. Async handlers are fired
   * but their promises are not awaited — rejections are silently caught.
   */
  emit(event: string, payload?: unknown): void {
    // Snapshot handlers so unsubscribing during dispatch doesn't affect iteration
    const matching = this.handlers.filter((h) => h.event === event);
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
   * Handlers that throw are silently skipped — their results are omitted
   * from the returned array.
   */
  async collect<T = unknown>(
    event: string,
    payload?: unknown,
  ): Promise<T[]> {
    const matching = this.handlers.filter((h) => h.event === event);
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
   * Returns null if no handler matches or all handlers return null/throw.
   */
  async request<T = unknown>(
    event: string,
    payload?: unknown,
  ): Promise<T | null> {
    const matching = this.handlers.filter((h) => h.event === event);
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
