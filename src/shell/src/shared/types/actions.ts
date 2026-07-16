/**
 * Shared action/audit types used by the cross-mod ActivityFeed component.
 *
 * These are decoupled from ELN-specific API shapes — property names use
 * camelCase, and the ActionItem interface is generic enough for any mod
 * (ELN, LIMS, Tags, Protocols, etc.) to map into.
 */

/** User summary embedded in an action response. */
export interface ActionUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  color: string;
}

/** A generic action log entry, decoupled from any specific mod's API shape. */
export interface ActionItem {
  id: number;
  performedBy: ActionUser;
  /** Triple-dotted action type, e.g. "eln.entry.created", "eln.table.edited". */
  actionType: string;
  targetType: string;
  targetId: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Visual state of an action item in the activity feed. */
export type ActionItemState = "confirmed" | "pending" | "reconciled";

/** An ActionItem annotated with its optimistic-update display state. */
export interface DisplayActionItem extends ActionItem {
  state: ActionItemState;
}
