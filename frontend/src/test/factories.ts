/**
 * Shared test fixture factories for frontend tests.
 *
 * This module exports canonical fixture factories so that every test file
 * doesn't need its own copy.  When a domain model changes (e.g., a new field
 * on EntityListItem), update **this module** — every test imports from here
 * and picks up the change automatically.
 *
 * Usage:
 *
 *     import { makeEntityListItem, makeEntityPage, emptyPage } from "../test/factories";
 *
 * Do **not** copy-paste these definitions into new test files.
 *
 * Mirrors the backend pattern: ``backend/core/tests/factories.py``.
 */

import type {
  EntityListItem,
  PaginatedResponse,
  EntityType,
  ColumnDef,
} from "../types/lims";
import type {
  LibraryEntryItem,
  LibraryFolderItem,
  LibraryContentsResponse,
} from "../types/library";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

// ── Pagination ──────────────────────────────────────────────────────────────

/** Empty paginated response. */
export function emptyPage<T>(): PaginatedResponse<T> {
  return {
    count: 0,
    next: null,
    previous: null,
    results: [],
  };
}

/** A paginated response containing the given entities.
 *  ``count`` is set to ``entities.length``. */
export function makeEntityPage<T>(
  entities: T[],
): PaginatedResponse<T> {
  return {
    count: entities.length,
    next: null,
    previous: null,
    results: entities,
  };
}

// ── LIMS / Entity ───────────────────────────────────────────────────────────

const _entityListItemDefaults: EntityListItem = {
  id: 1,
  display_id: "BLOOD1",
  name: "Sample A",
  entity_type: 1,
  entity_type_name: "Blood Sample",
  entity_type_prefix: "BLOOD",
  entity_type_icon: "🩸",
  properties: {},
  source_entry: null,
  source_entry_display_id: null,
  folder: null,
  created_by: null,
  created_by_username: null,
  created_at: "2025-01-01T00:00:00Z",
};

/** A single EntityListItem with sensible defaults.
 *  Pass ``overrides`` to customize only the fields your test cares about. */
export function makeEntityListItem(
  overrides?: Partial<EntityListItem>,
): EntityListItem {
  return { ..._entityListItemDefaults, ...overrides };
}

// ── Library ─────────────────────────────────────────────────────────────────

const _libraryFolderDefaults: LibraryFolderItem = {
  type: "folder",
  id: 1,
  name: "Experiments",
  parent: null,
  created_at: "2025-01-01T00:00:00Z",
};

/** A single LibraryFolderItem. */
export function makeLibraryFolder(
  overrides?: Partial<LibraryFolderItem>,
): LibraryFolderItem {
  return { ..._libraryFolderDefaults, ...overrides };
}

const _libraryEntryDefaults: LibraryEntryItem = {
  type: "entry",
  id: 1,
  display_id: "E1",
  title: "PCR Results",
  folder: null,
  folder_name: null,
  author_username: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

/** A single LibraryEntryItem. */
export function makeLibraryEntry(
  overrides?: Partial<LibraryEntryItem>,
): LibraryEntryItem {
  return { ..._libraryEntryDefaults, ...overrides };
}

/** A LibraryContentsResponse with folders + entries.
 *  If folders / entries are omitted, empty arrays are used. */
export function makeLibraryContents(
  folders?: LibraryFolderItem[],
  entries?: LibraryEntryItem[],
  overrides?: Partial<LibraryContentsResponse>,
): LibraryContentsResponse {
  return {
    count: (folders ?? []).length + (entries ?? []).length,
    next: null,
    previous: null,
    results: [...(folders ?? []), ...(entries ?? [])],
    current_folder_id: null,
    ...overrides,
  };
}

// ── EntityType / Settings ───────────────────────────────────────────────────

const _entityTypeDefaults: EntityType = {
  id: 1,
  name: "Blood Sample",
  prefix: "BLOOD",
  icon: "🩸",
  is_active: true,
  columns: [],
};

/** A single EntityType. */
export function makeEntityType(
  overrides?: Partial<EntityType>,
): EntityType {
  return { ..._entityTypeDefaults, ...overrides };
}

const _columnDefDefaults: ColumnDef = {
  name: "volume",
  type: "Number",
};

/** A single ColumnDef. */
export function makeColumnDef(
  overrides?: Partial<ColumnDef>,
): ColumnDef {
  return { ..._columnDefDefaults, ...overrides };
}

// ── TipTap editor (for extension tests) ─────────────────────────────────────

/**
 * Create a minimal TipTap editor pre-configured with StarterKit plus the
 * given extensions.  The editor is mounted in a DOM div appended to
 * ``document.body``.
 *
 * The caller is responsible for calling ``editor.destroy()`` when done.
 * The backing DOM element is available as ``editor.options.element``.
 *
 * @param extensions - Additional TipTap extensions beyond StarterKit.
 * @param content    - Optional initial content (HTML string or TipTap JSON doc).
 */
export function createTestEditor(
  extensions: any[] = [],
  content?: string | Record<string, unknown>,
): Editor {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const editor = new Editor({
    element: el,
    extensions: [StarterKit, ...extensions],
    content: content ?? { type: "doc", content: [{ type: "paragraph" }] },
  });
  return editor;
}
