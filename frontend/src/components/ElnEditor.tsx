/**
 * ElnEditor — rich-text editor for ELN entries.
 *
 * Composes:
 *   - useEntryEditor    — state machine hook (CRUD, dirty tracking, beforeunload)
 *   - createElnExtensions — TipTap extension factory
 *
 * Content layout (PRD #4):
 *   Status bar → Metadata line → Title → Description → Tags → Divider → ProseMirror
 *
 * Action buttons (Save/Cancel/Edit/Delete/folder/status) are exposed via ref so
 * the parent (ElnDetail) can render them in the top toolbar as ghost icon buttons.
 */
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import { EMPTY_DOC, type TipTapDoc, type EntryDetail, type Tag } from "../types/eln";
import { useEntryEditor } from "../hooks/useEntryEditor";
import { createElnExtensions } from "../extensions/createElnExtensions";

/** Format an ISO date string as YYYY-MM-DD. */
function formatDateShort(iso: string): string {
  return new Date(iso).toISOString().split("T")[0];
}

/** Public handle exposed to parent components via ref. */
export interface ElnEditorHandle {
  save: () => void;
  cancel: () => void;
  deleteEntry: () => void;
  enterEditMode: () => void;
  setFolderId: (id: number | null) => void;
  setStatus: (status: string) => void;
}

interface FolderItem {
  id: number;
  name: string;
}

/** Available tag colors with their design-token CSS classes. */
const TAG_COLORS: { key: string; label: string; bgClass: string; textClass: string; borderClass: string; hex: string }[] = [
  { key: "enzyme",      label: "Enzyme",      bgClass: "bg-enzyme",      textClass: "text-enzyme-foreground",      borderClass: "border-enzyme-foreground/20",      hex: "#d9b3e6" },
  { key: "flask",       label: "Flask",       bgClass: "bg-flask",       textClass: "text-flask-foreground",       borderClass: "border-flask-foreground/20",       hex: "#b3d9e6" },
  { key: "solvent",     label: "Solvent",     bgClass: "bg-solvent",     textClass: "text-solvent-foreground",     borderClass: "border-solvent-foreground/20",     hex: "#b3e6c8" },
  { key: "warn",        label: "Warn",        bgClass: "bg-warn",        textClass: "text-warn-foreground",        borderClass: "border-warn-foreground/20",        hex: "#e6d9b3" },
  { key: "primary",     label: "Primary",     bgClass: "bg-primary",     textClass: "text-primary-foreground",     borderClass: "border-primary-foreground/20",     hex: "#7fb3d9" },
  { key: "success",     label: "Success",     bgClass: "bg-success",     textClass: "text-success-foreground",     borderClass: "border-success-foreground/20",     hex: "#b3e6b3" },
  { key: "destructive", label: "Destructive", bgClass: "bg-destructive", textClass: "text-destructive-foreground", borderClass: "border-destructive-foreground/20", hex: "#e6b3b3" },
  { key: "muted",       label: "Muted",       bgClass: "bg-muted",       textClass: "text-muted-foreground",       borderClass: "border-muted-foreground/20",       hex: "#d9d9d9" },
];

function getTagColor(key: string) {
  return TAG_COLORS.find((c) => c.key === key) || TAG_COLORS[7]; // default: muted
}

/** Snapshot of editor state pushed to parent via onStateChange. */
export interface ElnEditorState {
  mode: string;
  isEdit: boolean;
  isSaving: boolean;
  isDirty: boolean;
  deleting: boolean;
  /** Full entry data for the metadata panel (null for new entries). */
  entry: EntryDetail | null;
  /** Folders available for the folder picker. */
  folders: FolderItem[];
  /** Current folder ID (null if unset). */
  folderId: number | null;
  /** Current status value from the entry. */
  status: string;
  /** Current tags on the entry. */
  tags: Tag[];
}

interface ElnEditorProps {
  entryId?: string;
  /** Called whenever editor mode/state changes so the parent can render
   *  the correct action buttons (Save/Cancel vs Edit/Delete). */
  onStateChange?: (state: ElnEditorState) => void;
}

/** Editor component — ReferenceProvider is provided by Layout.
 *  Action buttons are exposed via ref so the parent can render them in
 *  the top toolbar. */
const ElnEditor = forwardRef<ElnEditorHandle, ElnEditorProps>(
  function ElnEditor({ entryId, onStateChange }, ref) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = entryId === undefined;

  // ── Read initial folder from URL params (set when creating from library) ──
  const initialFolderId: number | null = (() => {
    const raw = searchParams.get("folderId");
    if (raw) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  })();

  // ── Content ref (synced on every editor update and on every render) ──
  const contentRef = useRef<TipTapDoc>(EMPTY_DOC);

  // ── TipTap Editor ──
  const editor = useEditor({
    extensions: createElnExtensions(),
    content: isNew
      ? EMPTY_DOC
      : { type: "doc", content: [{ type: "paragraph" }] },
    editable: isNew,
    editorProps: {
      attributes: {
        class: "ProseMirror",
      },
    },
    // Keep contentRef in sync on every editor update, even when React
    // suppresses re-renders (useEditorState selector returns null by
    // default, so ElnEditor does NOT re-render on transactions).
    onUpdate: ({ editor }) => {
      contentRef.current = editor.getJSON() as TipTapDoc;
    },
  });

  // Sync on every render to cover cases outside PM transactions
  // (e.g. initial editor creation, setContent in useEffect, mode transitions).
  // Redundant with onUpdate for normal edits but ensures contentRef is never stale.
  contentRef.current = editor?.getJSON() ?? EMPTY_DOC;

  // ── State machine ──
  const {
    mode,
    entry,
    title,
    setTitle,
    initialContent,
    folderId,
    setFolderId,
    folders,
    status,
    setStatus,
    error,
    deleting,
    isDirty,
    tags,
    addTag,
    removeTag,
    createAndAttachTag,
    searchTags,
    save,
    cancel,
    deleteEntry,
    enterEditMode,
  } = useEntryEditor({ entryId, isNew, initialFolderId, contentRef });

  // ── Tag input state ──
  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Tag[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [pendingTagName, setPendingTagName] = useState<string | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const handleTagQueryChange = useCallback((value: string) => {
    setTagQuery(value);
    setPendingTagName(null);
    if (value.trim()) {
      searchTags(value).then((results) => {
        // Filter out tags already attached
        setTagSuggestions(results.filter((r) => !tags.some((t) => t.id === r.id)));
      });
    } else {
      setTagSuggestions([]);
    }
  }, [searchTags, tags]);

  const handleSelectTag = useCallback(async (tag: Tag) => {
    await addTag(tag);
    setTagQuery("");
    setTagSuggestions([]);
    setShowTagInput(false);
    tagInputRef.current?.focus();
  }, [addTag]);

  const handleCreateTag = useCallback((name: string) => {
    setPendingTagName(name);
    setTagSuggestions([]);
  }, []);

  const handlePickColor = useCallback(async (colorKey: string) => {
    if (!pendingTagName) return;
    await createAndAttachTag(pendingTagName.trim(), colorKey);
    setPendingTagName(null);
    setTagQuery("");
    setShowTagInput(false);
    tagInputRef.current?.focus();
  }, [pendingTagName, createAndAttachTag]);

  // ── Expose actions to parent via ref ──
  // Store latest callbacks in a ref so useImperativeHandle doesn't
  // re-attach on every render.
  const actionsRef = useRef({ save, cancel, deleteEntry, enterEditMode, setFolderId, setStatus });
  actionsRef.current = { save, cancel, deleteEntry, enterEditMode, setFolderId, setStatus };

  useImperativeHandle(ref, () => ({
    save: () => actionsRef.current.save(),
    cancel: () => actionsRef.current.cancel(),
    deleteEntry: () => actionsRef.current.deleteEntry(),
    enterEditMode: () => actionsRef.current.enterEditMode(),
    setFolderId: (id: number | null) => actionsRef.current.setFolderId(id),
    setStatus: (s: string) => actionsRef.current.setStatus(s),
  }), []);

  // ── Sync editor with hook state ──
  useEffect(() => {
    if (!editor) return;
    const shouldEdit = mode === "edit-new" || mode === "edit-existing";
    editor.setEditable(shouldEdit);

    // When entering view mode, reset content to initial if it differs.
    // This handles both initial load (loading→view) and cancel (edit→view).
    if (
      mode === "view" &&
      JSON.stringify(editor.getJSON()) !== JSON.stringify(initialContent)
    ) {
      editor.commands.setContent(initialContent);
    }
  }, [mode, editor, initialContent]);

  // ── Notify parent of state changes ──
  const isEdit = mode === "edit-new" || mode === "edit-existing";
  const isSaving = mode === "saving";

  useEffect(() => {
    onStateChange?.({ mode, isEdit, isSaving, isDirty, deleting, entry, folders, folderId, status, tags });
  }, [mode, isEdit, isSaving, isDirty, deleting, entry, folders, folderId, status, tags, onStateChange]);

  // ── Render ──

  if (mode === "loading") {
    return <p className="text-center text-muted-foreground py-12">Loading…</p>;
  }

  if (mode === "error") {
    return (
      <div>
        <div className="error">{error}</div>
        <button onClick={() => navigate("/library")}>← Back to entries</button>
      </div>
    );
  }

  return (
    <div className={isSaving ? "pointer-events-none opacity-60" : ""}>
      {/* ── Status bar (save indicator only; action buttons are rendered
           by ElnDetail in the top toolbar). ── */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isEdit && (
            <span
              className={`text-xs ${isDirty ? "text-primary" : "text-muted-foreground"}`}
            >
              {isDirty ? "Unsaved changes" : "Saved"}
            </span>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && <div className="error">{error}</div>}

      {/* ── Content area ── */}

      {/* Metadata line */}
      <div
        className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
        data-testid="metadata-line"
      >
        {entry ? (
          <>
            {entry.display_id}
            {" · "}
            Created {formatDateShort(entry.created_at)}
            {" · "}
            Updated {formatDateShort(entry.updated_at)}
            {" · "}v0.4{" · "}
            autosaved 2s ago
          </>
        ) : (
          "New entry"
        )}
      </div>

      {/* Title */}
      {isEdit ? (
        <input
          className="mb-3 w-full bg-transparent font-serif text-[42px] font-semibold leading-[1.05] tracking-tight text-foreground placeholder:text-muted-foreground/30 outline-none"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          autoFocus={isNew}
          data-testid="title-input"
        />
      ) : (
        <h1
          className="mb-3 font-serif text-[42px] font-semibold leading-[1.05] tracking-tight text-foreground"
          data-testid="title-display"
        >
          {title || "Untitled"}
        </h1>
      )}

      {/* Description placeholder */}
      <p
        className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground"
        data-testid="description"
      >
        Third iteration of the sgRNA screen using the SpCas9-HF1 variant, with
        off-target analysis across three guide sequences and two cell lines.
      </p>

      {/* Tags */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="tags-section">
        {tags.map((tag) => {
          const c = getTagColor(tag.color);
          return (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-1 rounded-full border ${c.borderClass} ${c.bgClass} px-2 py-0.5 font-mono text-[0.72rem] ${c.textClass}`}
            >
              {tag.name}
              {isEdit && (
                <button
                  type="button"
                  className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-60 hover:opacity-100"
                  onClick={() => removeTag(tag.id)}
                  aria-label={`Remove tag ${tag.name}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </span>
          );
        })}

        {/* Tag input (edit mode only) */}
        {isEdit && (
          <div className="relative">
            {!showTagInput && !pendingTagName ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 font-mono text-[0.72rem] text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                onClick={() => setShowTagInput(true)}
                data-testid="add-tag-button"
              >
                + tag
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                {pendingTagName ? (
                  /* ── Color picker for new tag ── */
                  <div className="flex items-center gap-1 rounded-md border border-hairline bg-panel px-2 py-1.5" data-testid="color-picker">
                    <span className="mr-1 font-mono text-[0.7rem] text-muted-foreground">
                      "{pendingTagName}"
                    </span>
                    <div className="flex gap-1">
                      {TAG_COLORS.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          className="h-4 w-4 rounded-full border border-border hover:scale-125 transition-transform"
                          style={{ backgroundColor: c.hex }}
                          title={c.label}
                          onClick={() => handlePickColor(c.key)}
                          aria-label={`Color: ${c.label}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setPendingTagName(null)}
                      aria-label="Cancel color pick"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  /* ── Autocomplete input ── */
                  <input
                    ref={tagInputRef}
                    type="text"
                    className="!w-32 !py-0.5 !text-xs"
                    placeholder="Search tags…"
                    value={tagQuery}
                    onChange={(e) => handleTagQueryChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setShowTagInput(false);
                        setTagQuery("");
                        setTagSuggestions([]);
                      }
                    }}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => {
                        if (!pendingTagName) {
                          setShowTagInput(false);
                          setTagQuery("");
                          setTagSuggestions([]);
                        }
                      }, 150);
                    }}
                    autoFocus
                    data-testid="tag-search-input"
                  />
                )}

                {/* Autocomplete dropdown */}
                {tagSuggestions.length > 0 && !pendingTagName && (
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-hairline bg-panel py-1 shadow-lg" data-testid="tag-suggestions">
                    {tagSuggestions.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-[13px] hover:bg-muted"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectTag(t);
                        }}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: getTagColor(t.color).hex }}
                        />
                        <span>{t.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* "Create new" option when no exact match */}
                {tagQuery.trim() && !pendingTagName && !tags.some((t) => t.name.toLowerCase() === tagQuery.trim().toLowerCase()) && (
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-hairline bg-panel py-1 shadow-lg">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-[13px] hover:bg-muted text-primary"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleCreateTag(tagQuery.trim());
                      }}
                    >
                      + Create "{tagQuery.trim()}"
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hairline divider */}
      <div className="my-6 h-px bg-hairline" data-testid="content-divider" />

      {/* ── ProseMirror Content ── */}
      <div
        className={`min-h-[60vh]${!isEdit ? " cursor-text" : ""}`}
        onClick={() => {
          if (!isEdit && mode === "view") {
            enterEditMode();
          }
        }}
        data-testid="prosemirror-wrapper"
      >
        {editor && <EditorContent editor={editor} />}
      </div>
    </div>
  );
});

export default ElnEditor;
