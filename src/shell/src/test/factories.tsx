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
 * Mirrors the backend pattern: ``src/server/core/tests/factories.py``.
 */

import { vi } from "vitest";
import type {
  EntityListItem,
  PaginatedResponse,
  ColumnDef,
  Schema,
  SchemaTypeItem,
} from "../../../mods/lims/types";
import type {
  LibraryEntryItem,
  LibraryFolderItem,
  LibraryContentsResponse,
} from "../../../mods/library/types";
import type { Project } from "../../../mods/access/types";
import type { FolderShare } from "../../../mods/access/types";
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
  schema: 1,
  schema_name: "Blood Sample",
  schema_prefix: "BLOOD",
  properties: {},
  source_entry: null,
  source_entry_display_id: null,
  folder: null,
  author: null,
  author_username: null,
  status: "in_progress",
  updated_at: "2025-01-01T00:00:00Z",
  created_at: "2025-01-01T00:00:00Z",
  tags: [],
  effective_role: "edit",
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
  workspace_id: "eln",
  display_id: "E1",
  title: "PCR Results",
  icon: "flask-conical",
  color: "flask",
  folder: null,
  folder_name: null,
  author_username: null,
  author_info: null,
  status: "in_progress",
  description: "",
  tags: [],
  editors: [],
  samples_count: null,
  attachments_count: null,
  property_fields: {},
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
    current_project_id: 1,
    ...overrides,
  };
}

const _columnDefDefaults: ColumnDef = {
  name: "volume",
  type: "number",
};

/** A single ColumnDef. */
export function makeColumnDef(
  overrides?: Partial<ColumnDef>,
): ColumnDef {
  return { ..._columnDefDefaults, ...overrides };
}

// ── Schema (new shared model) ──────────────────────────────────────────────

const _schemaDefaults: Schema = {
  id: 1,
  name: "Blood Sample",
  description: undefined,
  prefix: "BLOOD",
  schema_type: 1,
  schema_type_display: "Entity",
  tags: [],
  is_default: false,
  is_active: true,
  columns: [],
  content_hash: "",
  icon: "",
  color: "",
  enabled_components: [],
};

/** A single Schema row. */
export function makeSchema(
  overrides?: Partial<Schema>,
): Schema {
  return { ..._schemaDefaults, ...overrides };
}

const _schemaTypeDefaults: SchemaTypeItem = {
  id: 1,
  display_name: "Entity",
  workspace_id: "lims",
  is_active: true,
  schema_type_id: "lims.entity",
  tags: [],
};

/** A single SchemaType item. */
export function makeSchemaType(
  overrides?: Partial<SchemaTypeItem>,
): SchemaTypeItem {
  return { ..._schemaTypeDefaults, ...overrides };
}

// ── Access / Project ─────────────────────────────────────────────────────

const _projectDefaults: Project = {
  id: 1,
  uid: "proj-001",
  name: "Test Project",
  icon_key: "flask",
  color_key: "crimson",
  is_archived: false,
  created_at: "2025-01-01T00:00:00Z",
  current_user_role: "read",
};

export function makeProject(
  overrides?: Partial<Project>,
): Project {
  return { ..._projectDefaults, ...overrides };
}

// ── Access / FolderShare ──────────────────────────────────────────────────

const _folderShareDefaults: FolderShare = {
  id: 1,
  source_folder: 1,
  source_folder_name: "Experiments",
  source_folder_path: "root/Experiments",
  source_project_id: 1,
  source_project_name: "Source Project",
  target_project: 2,
  target_project_name: "Target Project",
  level: "read",
};

export function makeFolderShare(
  overrides?: Partial<FolderShare>,
): FolderShare {
  return { ..._folderShareDefaults, ...overrides };
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

// ── MentionBadge mock ─────────────────────────────────────────────────────────

/**
 * Inline type definitions (instead of importing from MentionBadge)
 * so that consumer test files can `vi.mock` MentionBadge without
 * creating a circular module dependency during Vitest hoisting.
 */

interface BadgeResolved {
  displayId: string;
  title: string;
  type: "entry" | "entity";
  id: number;
  icon: string;
}

interface MentionBadgeProps {
  displayId: string;
  clickable?: boolean;
  resolved?: BadgeResolved | null;
}

/** Configuration for the MentionBadge mock factory. */
interface MockMentionBadgeConfig {
  /** Render as clickable (blue pill / anchor). Default false. */
  clickable?: boolean;
  /** Pre-resolved data. undefined = loading, null = broken, data = resolved. */
  resolved?: BadgeResolved | null;
  /** Omit the title span when resolved. Silently ignored in loading/broken states. */
  compact?: boolean;
  /** Override the default "ref-badge" data-testid. */
  testId?: string;
}

/**
 * Create a canonical mock for the MentionBadge component.
 *
 * The returned ``vi.fn()`` mock renders structurally realistic DOM — CSS classes,
 * data attributes, child spans, and link wrapping — matching the real
 * component's output for the given config.
 *
 * Usage:
 *
 *     vi.mock("../shared/components/MentionBadge", () => ({
 *       default: makeMockMentionBadge({ compact: true }),
 *     }));
 */
export function makeMockMentionBadge(
  config: MockMentionBadgeConfig = {},
) {
  const {
    clickable = false,
    resolved = undefined,
    compact = false,
    testId = "ref-badge",
  } = config;

  const isClickable = clickable;
  const hasResolved = resolved !== undefined && resolved !== null;
  const isBroken = clickable && resolved === null;
  const isLoading = clickable && resolved === undefined;
  const showTitle = hasResolved && !compact;

  return vi.fn((props: MentionBadgeProps) => {
    const { displayId } = props;

    // ── Build CSS classes ──────────────────────────────────────────────
    const classes = ["reference-badge"];
    if (isClickable) {
      classes.push("is-clickable");
    } else {
      classes.push("is-nonclickable");
    }
    if (hasResolved) classes.push("is-resolved");
    if (isBroken) classes.push("is-broken");

    // ── Loading state: just text, no child spans ────────────────────────
    if (isLoading) {
      return (
        <span
          data-testid={testId}
          data-display-id={displayId}
          className={classes.join(" ")}
          data-clickable="true"
        >
          {displayId}
        </span>
      );
    }

    // ── Build children ──────────────────────────────────────────────────
    const children: React.ReactNode[] = [];

    // Icon span (resolved only, not broken)
    if (hasResolved) {
      children.push(
        <span key="icon" className="ref-badge-icon">
          {resolved!.icon}
        </span>,
      );
    }

    // ID span
    children.push(
      <span key="id" className="ref-badge-id">
        {displayId}
      </span>,
    );

    // Title span (resolved + not compact)
    if (showTitle) {
      children.push(
        <span key="title" className="ref-badge-title">
          {resolved!.title}
        </span>,
      );
    }

    // ── Anchor: clickable + resolved ────────────────────────────────────
    if (isClickable && hasResolved) {
      const href =
        resolved!.type === "entity"
          ? `/lims/${resolved!.displayId}`
          : `/eln/${resolved!.displayId}`;

      return (
        <a
          data-testid={testId}
          data-display-id={displayId}
          className={classes.join(" ")}
          href={href}
          data-clickable="true"
        >
          {children}
        </a>
      );
    }

    // ── Span: all other states ──────────────────────────────────────────
    const spanProps: Record<string, string> = {
      "data-testid": testId,
      "data-display-id": displayId,
      className: classes.join(" "),
    };
    if (isClickable) spanProps["data-clickable"] = "true";
    if (isBroken) spanProps["title"] = "Reference not found";

    return <span {...spanProps}>{children}</span>;
  });
}
