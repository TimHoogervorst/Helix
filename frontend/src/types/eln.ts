/** TipTap/ProseMirror document — the stored rich-text content format. */
export type TipTapDoc = Record<string, unknown>;

/** An entry as shown in the list view. */
export interface EntryListItem {
  id: number;
  display_id: string;
  title: string;
  author_username: string | null;
  created_at: string;
  updated_at: string;
}

/** A full entry returned by the detail endpoint. */
export interface EntryDetail {
  id: number;
  display_id: string;
  title: string;
  content: TipTapDoc;
  folder: number;
  folder_name: string;
  author: number | null;
  author_username: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload for creating a new entry. */
export interface EntryCreatePayload {
  title: string;
  content: TipTapDoc;
  folder?: number;
}

/** Payload for updating an existing entry. */
export interface EntryUpdatePayload {
  title: string;
  content: TipTapDoc;
  folder?: number;
}

/** An empty TipTap document — a single empty paragraph. */
export const EMPTY_DOC: TipTapDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
