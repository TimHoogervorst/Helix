/** Resolved target details returned by the API. */
export interface ResolvedRef {
  id: number;
  display_id: string;
  title: string;
  type: string;
}

/** An item returned by the search autocomplete API. */
export interface SearchResult {
  display_id: string;
  title: string;
  type: string;
}
