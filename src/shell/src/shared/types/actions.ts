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
  /** Correlation ID tying together action rows from the same batch request. */
  requestId?: string;
}

/**
 * A group of consecutive confirmed DisplayActionItems that share a requestId.
 *
 * Created by `groupConfirmedActions()` — never produced by the API directly.
 * Groups with a single child are NOT wrapped; they pass through as flat
 * DisplayActionItems.
 */
export interface GroupedDisplayItem {
  type: "group";
  /** Synthetic ID: "group-{requestId}". */
  id: string;
  /** Pre-computed summary text (see grouping rules in groupActions.ts). */
  summary: string;
  /** The constituent action items, in their original order. */
  children: DisplayActionItem[];
  /** Timestamp of the most recent child. */
  createdAt: string;
  /** User from the most recent child. */
  performedBy: ActionUser;
  /** Groups only contain confirmed items. */
  state: "confirmed";
}

/** A single entry in the activity feed — either a flat item or a grouped batch. */
export type FeedItem = DisplayActionItem | GroupedDisplayItem;
