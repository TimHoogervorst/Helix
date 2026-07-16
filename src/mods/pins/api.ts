import { get, post, del } from "../../core/api/client";
import type { PinnedWorkspace } from "./types";

/** Fetch all pinned workspaces for the current user. */
export function getPins(): Promise<PinnedWorkspace[]> {
  return get<PinnedWorkspace[]>("/core/pins/");
}

/** Create a new pinned workspace. */
export function createPin(data: {
  display_id: string;
  label: string;
  url: string;
}): Promise<PinnedWorkspace> {
  return post<PinnedWorkspace>("/core/pins/", data);
}

/** Delete a pinned workspace by ID. */
export function deletePin(id: number): Promise<void> {
  return del(`/core/pins/${id}/`);
}
