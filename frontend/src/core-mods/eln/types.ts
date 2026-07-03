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

/** A notebook entry displayed in the Library console and ELN workspace.
 *  Extends the list item with folder info and a discriminant for console routing. */
export interface ElnEntry {
  type: "entry";
  id: number;
  display_id: string;
  title: string;
  folder: number | null;
  folder_name: string | null;
  author_username: string | null;
  created_at: string;
  updated_at: string;
}

/** A tag attached to an entry. */
export interface Tag {
  id: number;
  name: string;
  color: string;
  icon: string;
}

/** A mention — a parsed reference from an entry body to another entity. */
export interface Mention {
  id: number;
  source_type: number;
  source_type_name: string;
  source_id: number;
  target_type: number;
  target_type_name: string;
  target_id: number;
  target_display_id: string | null;
  target_title: string | null;
  context: string;
}

/** A full entry returned by the detail endpoint. */
export interface EntryDetail {
  id: number;
  display_id: string;
  title: string;
  content: TipTapDoc;
  folder: number | null;
  folder_name: string;
  folder_path: string;
  author: number | null;
  author_username: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  status_display: string;
  tags: Tag[];
  mentions: Mention[];
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

import type { GridColumnType } from "../../shared/types";

/** Summary of an entity type (schema) as returned by the LIMS API.
 *  Only includes the fields the ELN editor actually uses — not the full
 *  EntityType shape from the LIMS module. */
export interface EntityTypeSummary {
  id: number;
  name: string;
  prefix: string;
  columns: {
    name: string;
    type: GridColumnType;
    required?: boolean;
    default?: string;
    units?: string;
    description?: string;
  }[];
  is_active: boolean;
}

/** An empty TipTap document — a single empty paragraph. */
export const EMPTY_DOC: TipTapDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
