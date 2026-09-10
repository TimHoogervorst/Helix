/** TipTap/ProseMirror document — the stored rich-text content format. */
export type TipTapDoc = Record<string, unknown>;

/** An entry as shown in the list view. */
export interface EntryListItem {
  id: number;
  display_id: string;
  name: string;
  author_username: string | null;
  created_at: string;
  updated_at: string;
}

// Re-export for backward compatibility — canonical in mods/tags/types.
import type { Tag } from "../tags/types";
export type { Tag };

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
}

export interface SourcePathSegment {
  kind: "project" | "folder" | "entry" | "entity";
  id: number;
  name: string;
  uid?: string;
  display_id?: string;
}

/** A full entry returned by the detail endpoint. */
export interface EntryDetail {
  id: number;
  display_id: string;
  name: string;
  content: TipTapDoc;
  source_path: SourcePathSegment[];
  source_type?: number;
  source_id?: number;
  project?: number | null;
  project_name?: string | null;
  author: number | null;
  author_username: string | null;
  author_info: ActionUser | null;
  created_at: string;
  updated_at: string;
  status: string;
  status_display: string;
  tags: Tag[];
  mentions: Mention[];
}

/** Summary of an entity type (schema) as returned by the LIMS API.
 *  Only includes the fields the ELN editor actually uses — not the full
 *  EntityType shape from the LIMS module. */
export interface EntityTypeSummary {
  id: number;
  name: string;
  prefix: string;
  columns: {
    id?: string; // UUID assigned by the server (#252)
    name: string;
    type: string;
    required?: boolean;
    default?: string;
    units?: string;
    description?: string;
    dropdownId?: number;
    referenceSchemaId?: number;
    referenceSchemaTypeId?: number;
    expression?: string;
    resultType?: string;
  }[];
  is_active: boolean;
  content_hash: string; // SHA-256 of column definitions (#252)
  tags: string[];
}

/** An empty TipTap document — a single empty paragraph. */
export const EMPTY_DOC: TipTapDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** A single item within a protocol — either a checkable step or a note. */
export interface ProtocolItem {
  type: "step" | "note";
  text: string;
}

/** A protocol definition managed in Settings. */
export interface Protocol {
  id: number;
  name: string;
  items: ProtocolItem[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** User summary embedded in an action response. */
export interface ActionUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  color: string;
}

/** An action log entry returned by the actions endpoint. */
export interface ElnAction {
  id: number;
  action: string;
  action_type: string;
  target_type: string;
  target_id: number;
  request_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  performed_by: ActionUser;
}
