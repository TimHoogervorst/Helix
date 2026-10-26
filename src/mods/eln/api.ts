import { get, post, patch, del } from "@helix/mod-api/host";
import type { EntryDetail, EntryListItem, ElnAction, TipTapDoc } from "./types";

export interface DropdownDefinition {
  id: number;
  name: string;
  options: string[];
}

/** Read dropdown definitions through the host API rather than another Mod's source. */
export async function listDropdowns(): Promise<DropdownDefinition[]> {
  const response = await get<PaginatedResponse<DropdownDefinition> | DropdownDefinition[]>("/dropdowns/");
  return Array.isArray(response) ? response : response.results;
}

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

export interface HistoricalRendition {
  id: string;
  revision_id: string;
  revision_sequence: number;
  source_hash: string;
  captured_by: { id?: string; username?: string; displayName?: string };
  captured_at: string;
  presentation_provider: string;
  presentation_version: string;
  presentation_context: Record<string, unknown>;
  download_url: string;
  kind: "historical_rendition";
}

export interface ReviewCapture extends Omit<HistoricalRendition, "revision_sequence" | "captured_by" | "kind"> {
  attachment_id: string;
}

export interface ReviewState {
  available: boolean;
  reason?: string | null;
  state?: "authoring" | "submitted" | "finished";
  locked?: boolean;
  current_submission_id?: string | null;
  submissions?: Array<{
    id: string;
    round: number;
    manifest: Record<string, unknown>;
    submitted_at: string;
    submitted_by: Record<string, unknown>;
    withdrawn_at: string | null;
    rendition_id: string | null;
    download_url?: string | null;
  }>;
}

export interface ReviewThread {
  id: string;
  submission_id: string;
  original_submission_id: string;
  state: "open" | "addressed" | "resolved" | "withdrawn";
  blocking: boolean;
  anchor: Record<string, unknown>;
  suggestion: { replacement?: string };
  suggestion_disposition: "pending" | "applied" | "rejected";
  can_dispose_suggestion: boolean;
  requester: { username?: string; displayName?: string };
  requester_is_actor: boolean;
  messages: Array<{ id: string; body: string; author: { username?: string; displayName?: string }; retracted: boolean }>;
  can_resolve: boolean;
  can_address: boolean;
}
export interface ReviewThreadsState {
  participation: { id: string; submission_id: string; state: string; assessment: string } | null;
  threads: ReviewThread[];
  approval_available?: boolean;
  approval_unavailable_reason?: string | null;
  approval_unavailable_category?: "access" | "readiness" | "attribution" | "exclusion" | "blockers" | null;
  can_reopen?: boolean;
  approval?: { id: string; witness: { username?: string; displayName?: string }; assessment: string; approved_at: string } | null;
}
export function getReviewThreads(displayId: string): Promise<ReviewThreadsState> {
  return get<ReviewThreadsState>(`/eln/entries/${displayId}/review/threads/`);
}
export function startReviewParticipation(displayId: string) {
  return post<{ id: string; submission_id: string; state: string }>(`/eln/entries/${displayId}/review/participate/`, {});
}
export function addReviewThread(displayId: string, submissionId: string, anchor: Record<string, unknown>, body: string, replacement?: string) {
  return post<ReviewThread>(`/eln/entries/${displayId}/review/threads/`, { submission_id: submissionId, anchor, body, suggestion: replacement ? { replacement } : undefined });
}
export function changeReviewThread(displayId: string, threadId: string, action: "address" | "resolve" | "withdraw" | "reopen") {
  return post<ReviewThread>(`/eln/entries/${displayId}/review/threads/${threadId}/${action}/`, {});
}
export function disposeReviewSuggestion(displayId: string, threadId: string, action: "apply" | "reject", resultRevisionId?: string, resultFrom?: number) {
  return post<ReviewThread>(`/eln/entries/${displayId}/review/threads/${threadId}/suggestion/${action}/`, { result_revision_id: resultRevisionId, result_from: resultFrom });
}
export function replyReviewThread(displayId: string, threadId: string, body: string) {
  return post<ReviewThread>(`/eln/entries/${displayId}/review/threads/${threadId}/messages/`, { body });
}
export function assessReview(displayId: string, assessment: string) {
  return post(`/eln/entries/${displayId}/review/assess/`, { assessment, outcome: "request_changes" });
}
export function finishReview(displayId: string, assessment: string) {
  return post(`/eln/entries/${displayId}/review/assess/`, { assessment, outcome: "finish_review" });
}
export function approveReview(displayId: string, assessment: string, requestId: string) {
  return post(`/eln/entries/${displayId}/review/assess/`, { assessment, outcome: "approve", request_id: requestId });
}
export function reopenReview(displayId: string, reason: string) {
  return post(`/eln/entries/${displayId}/review/reopen/`, { reason });
}

export function submitReview(
  displayId: string,
  stateToken: string,
  revisionId: string,
  requestId: string,
): Promise<{ target_id: string; submission_id: string; round: number; state: string; manifest: Record<string, unknown>; rendition_id: string; attachment_id: string; download_url: string }> {
  return post<{ target_id: string; submission_id: string; round: number; state: string; manifest: Record<string, unknown>; rendition_id: string; attachment_id: string; download_url: string }>(`/eln/entries/${displayId}/review/submit/`, {
    state_token: stateToken,
    revision_id: revisionId,
    request_id: requestId,
  });
}

export function withdrawReview(displayId: string, requestId: string): Promise<{ target_id: string; submission_id: string; state: string; replayed: boolean }> {
  return post<{ target_id: string; submission_id: string; state: string; replayed: boolean }>(`/eln/entries/${displayId}/review/withdraw/`, { request_id: requestId });
}

export function getReviewState(displayId: string): Promise<ReviewState> {
  return get<ReviewState>(`/eln/entries/${displayId}/review/status/`);
}

export function captureReview(
  displayId: string,
  stateToken: string,
  revisionId: string,
): Promise<ReviewCapture> {
  return post<ReviewCapture>(`/eln/entries/${displayId}/review/`, {
    state_token: stateToken,
    revision_id: revisionId,
  });
}

export interface DiscussionMessageRevision {
  action: "create" | "amend" | "retract";
  body: string;
  actor: { id?: string; username?: string; displayName?: string };
  created_at: string;
}

export interface DiscussionMessage {
  id: string;
  parent_id: string | null;
  author: { id?: string; username?: string; displayName?: string };
  created_at: string;
  body: string;
  retracted: boolean;
  history: DiscussionMessageRevision[];
  can_change: boolean;
}

export interface Discussion {
  id: string;
  origin_id: string;
  record_id: string;
  created_by: { id?: string; username?: string; displayName?: string };
  created_at: string;
  resolved: boolean;
  resolved_by: { id?: string; username?: string; displayName?: string };
  resolved_at: string | null;
  can_contribute: boolean;
  can_resolve: boolean;
  messages: DiscussionMessage[];
}

export function listDiscussions(recordId: string): Promise<{ results: Discussion[]; can_contribute: boolean }> {
  return get<{ results: Discussion[]; can_contribute: boolean }>(`/discussions/?record=${encodeURIComponent(recordId)}`);
}

export function createDiscussion(recordId: string, body: string): Promise<Discussion> {
  return post<Discussion>("/discussions/", { record_id: recordId, body });
}

export function replyToDiscussion(id: string, body: string, parentId?: string): Promise<Discussion> {
  return post<Discussion>(`/discussions/${id}/`, { body, parent_id: parentId });
}

export function resolveDiscussion(id: string): Promise<Discussion> {
  return post<Discussion>(`/discussions/${id}/resolve/`, {});
}

export function amendDiscussionMessage(discussionId: string, messageId: string, body: string): Promise<Discussion> {
  return patch<Discussion>(`/discussions/${discussionId}/messages/${messageId}/`, { body });
}

export function retractDiscussionMessage(discussionId: string, messageId: string): Promise<Discussion> {
  return del<Discussion>(`/discussions/${discussionId}/messages/${messageId}/`);
}

export async function listRenditions(displayId: string): Promise<HistoricalRendition[]> {
  const response = await get<{ results: HistoricalRendition[] }>(
    `/eln/entries/${displayId}/renditions/`,
  );
  return response.results;
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
  url?: string,
): Promise<PaginatedResponse<ElnAction>> {
  if (url) {
    // DRF returns absolute next URLs, while the client expects an API-relative path.
    const path = url
      .replace(/^(?:https?:)?\/\/[^/]+/, "")
      .replace(/^\/api(?=\/)/, "");
    return get<PaginatedResponse<ElnAction>>(path);
  }

  const params = new URLSearchParams();
  if (actionType) params.set("action_type", actionType);
  if (since) params.set("since", since);

  const qs = params.toString();
  const path = `/eln/entries/${displayId}/actions/${qs ? `?${qs}` : ""}`;
  return get<PaginatedResponse<ElnAction>>(path);
}

/**
 * Log a custom action against an entry.
 */
export function createAction(
  displayId: string,
  action: string,
  actionType: string,
  metadata?: Record<string, unknown>,
): Promise<ElnAction> {
  return post<ElnAction>(`/eln/entries/${displayId}/actions/`, {
    action,
    action_type: actionType,
    metadata: metadata || {},
  });
}

/** Payload for creating a new entry. */
export interface CreateEntryPayload {
  name: string;
  content: TipTapDoc;
  project?: number | null;
  source_type?: number;
  source_id?: number | null;
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

export interface PatchEntryPayload {
  status?: string;
  source_type?: number;
  source_id?: number;
}

export function patchEntry(
  displayId: string,
  payload: PatchEntryPayload,
): Promise<EntryDetail> {
  return patch<EntryDetail>(`/eln/entries/${displayId}/`, payload);
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
