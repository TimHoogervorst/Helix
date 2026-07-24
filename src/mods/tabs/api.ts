import { get, post, del } from "../../shell/src/api/client";
import type { PinnedWorkspace } from "./types";

/** Fetch all pinned workspaces for the current user. */
export function getTabs(): Promise<PinnedWorkspace[]> {
  return get<PinnedWorkspace[]>("/core/tabs/");
}

/** Create a new pinned workspace. */
export function createTab(data: {
  display_id: string;
  label: string;
  url: string;
}): Promise<PinnedWorkspace> {
  return post<PinnedWorkspace>("/core/tabs/", data);
}

/** Delete a pinned workspace by ID. */
export function deleteTab(id: number): Promise<void> {
  return del(`/core/tabs/${id}/`);
}
