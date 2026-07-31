/**
 * Single event contract shared by block registrations, typed handles, and
 * the bus.  ``BlockEvent`` owns the declaration-to-emission contract —
 * the same shape is used at registration time, binding time, and runtime
 * emission.
 *
 * ## Categories
 *
 * - **action** — auditable domain event persisted by the action-logging
 *   layer (created / edited / deleted).  Backed by a backend catalog entry.
 * - **ui** — workspace-internal signal (column resized, sort changed).
 *   Stays on the bus; never hits the database.
 *
 * @remarks
 * ``tags`` is reserved for a future listen-by-tag feature
 * (``bus.onTag("audit", handler)``).  It is stored but not consumed yet.
 */
export class BlockEvent {
  /**
   * Local event identifier, e.g. ``"entities-registered"``.
   * Combined with the block's global ID to form the full bus event key.
   */
  readonly id: string;

  /** ``"action"`` for auditable events, ``"ui"`` for in-workspace signals. */
  readonly category: "action" | "ui";

  /**
   * Audit classification.
   *
   * - ``"created" | "edited" | "deleted"`` — lifecycle or domain mutations.
   * - ``"ui"`` — workspace-internal signal (always paired with ``category: "ui"``).
   */
  readonly core: "created" | "edited" | "deleted" | "ui";

  /** Reserved for future listen-by-tag.  Stored, not consumed. */
  readonly tags: string[];

  // ── Construction ──────────────────────────────────────────────────────

  private constructor(
    id: string,
    category: "action" | "ui",
    core: "created" | "edited" | "deleted" | "ui",
    tags: string[] = [],
  ) {
    this.id = id;
    this.category = category;
    this.core = core;
    this.tags = tags;
  }

  // ── Static factories ──────────────────────────────────────────────────

  /**
   * Create an auditable domain event.
   *
   * Produces ``category: "action"`` with the given ``core`` classification.
   * Used for lifecycle events and custom domain actions that should be
   * persisted in the action log.
   */
  static action(args: {
    id: string;
    core: "created" | "edited" | "deleted";
    tags?: string[];
  }): BlockEvent {
    return new BlockEvent(args.id, "action", args.core, args.tags);
  }

  /**
   * Create a UI-only workspace signal.
   *
   * Produces ``category: "ui"`` with ``core: "ui"``.  These events stay
   * on the bus and never hit the database — they are for in-workspace
   * communication between blocks (e.g. column resized, sort changed).
   */
  static ui(args: { id: string; tags?: string[] }): BlockEvent {
    return new BlockEvent(args.id, "ui", "ui", args.tags);
  }

  // ── Runtime ───────────────────────────────────────────────────────────

  /**
   * Construct the full bus payload shape for this event.
   *
   * Combines the event's identity with caller-supplied data into the
   * canonical bus payload.  Not wired to the actual bus yet — that
   * integration happens in a follow-up issue.
   *
   * @param payload - Arbitrary caller-supplied data for the event.
   * @returns The full bus payload object.
   */
  fire(payload: Record<string, unknown>): Record<string, unknown> {
    return {
      eventId: this.id,
      category: this.category,
      core: this.core,
      tags: this.tags,
      payload,
    };
  }
}
