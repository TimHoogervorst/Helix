import { get, post, del } from "../../shell/src/api/client";
import type { EntryDetail, EntryListItem, ElnAction, TipTapDoc } from "./types";

/** Lock status response from the lock endpoints. */
export interface LockStatus {
  locked: boolean;
  held_by?: number;
  held_by_username?: string;
  acquired_at?: string;
  last_activity_at?: string;
  detail?: string;
}

/**
 * DRF paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** List ELN entries with optional pagination. */
export async function listEntries(url?: string): Promise<PaginatedResponse<EntryListItem>> {
  const path = url
    ? url.replace("/api", "")
    : "/eln/entries/";
  return get<PaginatedResponse<EntryListItem>>(path);
}

/**
 * Attach one or more tags to a notebook entry.
 * Returns the full updated entry.
 */
export function attachTags(
  displayId: string,
  tagIds: number[],
): Promise<EntryDetail> {
  return post<EntryDetail>(`/eln/entries/${displayId}/tags/`, { tag_ids: tagIds });
}

/**
 * Detach a single tag from a notebook entry.
 * Returns the full updated entry.
 */
export function detachTag(
  displayId: string,
  tagId: number,
): Promise<EntryDetail> {
  return del<EntryDetail>(`/eln/entries/${displayId}/tags/${tagId}/`);
}

/**
 * Fetch actions for an entry, optionally filtered by action_type and/or since.
 *
 * @param displayId  The entry's display_id (e.g. "E-0001").
 * @param actionType Optional filter, e.g. "edited" or "created".
 * @param since      Optional ISO 8601 datetime to filter actions after.
 *                    Defaults to one week ago when fetching edited actions for
 *                    the avatar row.
 */
export async function fetchActions(
  displayId: string,
  actionType?: string,
  since?: string,
): Promise<ElnAction[]> {
  const params = new URLSearchParams();
  if (actionType) params.set("action_type", actionType);
  if (since) params.set("since", since);

  const qs = params.toString();
  const path = `/eln/entries/${displayId}/actions/${qs ? `?${qs}` : ""}`;
  const data = await get<{ results: ElnAction[] }>(path);
  return data.results ?? [];
}

/**
 * Log a custom action against an entry.
 */
export function createAction(
  displayId: string,
  actionType: string,
  metadata?: Record<string, unknown>,
): Promise<ElnAction> {
  return post<ElnAction>(`/eln/entries/${displayId}/actions/`, {
    action_type: actionType,
    metadata: metadata || {},
  });
}

/** Payload for creating a new entry. */
export interface CreateEntryPayload {
  title: string;
  content: TipTapDoc;
  folder?: number | null;
  status?: string;
  tag_ids?: number[];
}

/**
 * Create a new entry on the server immediately.
 * Returns the full entry detail including display_id.
 */
export function createEntry(payload: CreateEntryPayload): Promise<EntryDetail> {
  return post<EntryDetail>("/eln/entries/", payload);
}

// ── Lock API ────────────────────────────────────────────────────────────────

/**
 * Acquire or refresh the lock on an entry.
 *
 * Returns 201 for a new lock, 200 for a refreshed lock.
 * Throws ApiError with status 423 if another user holds the lock.
 */
export function acquireLock(displayId: string): Promise<LockStatus> {
  return post<LockStatus>(`/eln/entries/${displayId}/lock/`, {});
}

/** Release the lock on an entry. */
export function releaseLock(displayId: string): Promise<void> {
  return del<void>(`/eln/entries/${displayId}/lock/`);
}

/** Get the current lock status for an entry. */
export function getLockStatus(displayId: string): Promise<LockStatus> {
  return get<LockStatus>(`/eln/entries/${displayId}/lock/`);
}
