/** A user-pinned workspace bookmark as returned by the API. */
export interface PinnedWorkspace {
  id: number;
  display_id: string;
  label: string;
  url: string;
  created_at: string;
}

/** Resolved metadata for the currently active workspace (derived from the URL). */
export interface CurrentWorkspace {
  displayId: string;
  url: string;
  icon: "lims" | "eln";
}
