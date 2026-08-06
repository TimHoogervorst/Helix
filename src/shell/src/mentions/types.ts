/** Resolved target details returned by the API. */
export interface ResolvedMention {
  id: number;
  display_id: string;
  title: string;
  type: string;
  icon: string;
  color: string;
  /** The workspace that owns this entity, e.g. "eln" or "lims". */
  workspaceId: string | null;
}

/** An item returned by the search autocomplete API. */
export interface SearchResult {
  display_id: string;
  title: string;
  type: string;
  icon: string;
  color: string;
  /** The workspace that owns this entity, e.g. "eln" or "lims". */
  workspaceId: string | null;
}
