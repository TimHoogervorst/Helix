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
import { useEffect, useLayoutEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X, Circle, Dna, Rat, Leaf, Cog, NotebookText, User, Folder } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import { EMPTY_DOC, type TipTapDoc, type EntryDetail, type Tag } from "../types";
import { useEntryEditor } from "../hooks/useEntryEditor";
import { createElnExtensions } from "./extensions/createElnExtensions";

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

/** Available tag icons with their Lucide component. */
const TAG_ICONS: { key: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "circle",   label: "Circle",  Icon: Circle },
  { key: "dna",      label: "DNA",     Icon: Dna },
  { key: "rat",      label: "Rat",     Icon: Rat },
  { key: "leaf",     label: "Leaf",    Icon: Leaf },
  { key: "cog",      label: "Machine", Icon: Cog },
  { key: "notebook", label: "Entry",   Icon: NotebookText },
  { key: "user",     label: "Person",  Icon: User },
  { key: "folder",   label: "Folder",  Icon: Folder },
];

function getTagIcon(key: string) {
  return TAG_ICONS.find((i) => i.key === key) || TAG_ICONS[0]; // default: circle
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
  /** Current description text (first paragraph of TipTap content). */
  description: string;
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

  // ── Title ref (for contentEditable cursor preservation) ──
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  // ── Description textarea ref (for auto-resize) ──
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

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
    description,
    setDescription,
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
    changeTagIcon,
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
  const [pendingTagIcon, setPendingTagIcon] = useState<string>("circle");
  const [iconPickerForTag, setIconPickerForTag] = useState<number | null>(null);
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
    setPendingTagIcon("circle");
    setTagSuggestions([]);
  }, []);

  const handlePickColor = useCallback(async (colorKey: string) => {
    if (!pendingTagName) return;
    await createAndAttachTag(pendingTagName.trim(), colorKey, pendingTagIcon);
    setPendingTagName(null);
    setPendingTagIcon("circle");
    setTagQuery("");
    setShowTagInput(false);
    tagInputRef.current?.focus();
  }, [pendingTagName, pendingTagIcon, createAndAttachTag]);

  const handlePickIcon = useCallback((iconKey: string) => {
    setPendingTagIcon(iconKey);
  }, []);

  const handleChangeIcon = useCallback(async (tagId: number, iconKey: string) => {
    await changeTagIcon(tagId, iconKey);
    setIconPickerForTag(null);
  }, [changeTagIcon]);

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

  // Sync contentEditable h1 DOM when switching between view/edit modes or when
  // title changes externally (initial load, cancel). During typing, the title
  // and DOM are already in sync so the equality check skips the DOM write.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const desired = title || "Untitled";
    if (el.textContent !== desired) {
      el.textContent = desired;
    }
  }, [isEdit, title]);

  // Auto-resize description textarea to fit its content exactly.
  // Fires when description changes (typing, loading, cancel, mode switch).
  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    // Reset to auto so scrollHeight reflects the true content height,
    // then set to that height so there's no extra whitespace.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description, isEdit]);

  useEffect(() => {
    onStateChange?.({ mode, isEdit, isSaving, isDirty, deleting, entry, folders, folderId, status, tags, description });
  }, [mode, isEdit, isSaving, isDirty, deleting, entry, folders, folderId, status, tags, description, onStateChange]);

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

      {/* Title — contentEditable h1 that stays in place across view/edit modes.
           A ref + useLayoutEffect prevents React from resetting cursor position
           during typing while keeping the same DOM element in both modes. */}
      <h1
        ref={(el) => {
          titleRef.current = el;
          // Autofocus new entries
          if (el && isEdit && isNew) {
            requestAnimationFrame(() => el.focus());
          }
        }}
        contentEditable={isEdit}
        suppressContentEditableWarning
        onInput={(e) => {
          if (isEdit) setTitle(e.currentTarget.textContent || "");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        onBlur={() => {
          if (title.trim() !== title) setTitle(title.trim());
        }}
        className="mb-3 font-serif text-[42px] font-semibold leading-[1.05] tracking-tight text-foreground outline-none empty:before:text-muted-foreground/30 empty:before:content-['Untitled']"
        data-testid="title-display"
      >
        {!isEdit ? (title || "Untitled") : null}
      </h1>

      {/* Description — first paragraph of TipTap content, inline-editable */}
      {isEdit ? (
        <textarea
          ref={descriptionRef}
          className="eln-description-textarea mb-3 w-full resize-none overflow-hidden text-[15px] leading-relaxed text-muted-foreground placeholder:text-muted-foreground/30"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description…"
          data-testid="description-input"
        />
      ) : (
        <p
          className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground"
          data-testid="description"
        >
          {description || (
            <span className="text-muted-foreground/40 italic">
              No description
            </span>
          )}
        </p>
      )}

      {/* Tags */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="tags-section">
        {tags.map((tag) => {
          const c = getTagColor(tag.color);
          const ico = getTagIcon(tag.icon);
          const IconComponent = ico.Icon;
          const isOpen = iconPickerForTag === tag.id;
          return (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-1 rounded-full border ${c.borderClass} ${c.bgClass} px-2 py-0.5 font-mono text-[0.72rem] ${c.textClass}`}
            >
              {isEdit ? (
                <span className="relative">
                  <button
                    type="button"
                    className="btn-icon inline-flex h-4 w-4 items-center justify-center rounded-full !p-0"
                    onClick={() => setIconPickerForTag(isOpen ? null : tag.id)}
                    aria-label={`Change icon for ${tag.name}`}
                    title={ico.label}
                  >
                    <IconComponent className="h-3 w-3" aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <div
                      className="absolute left-0 top-full z-50 mt-1 flex gap-0.5 rounded-md border border-hairline bg-panel px-2 py-1.5 shadow-lg"
                      data-testid="icon-picker-popover"
                    >
                      {TAG_ICONS.map((ico) => {
                        const isSelected = tag.icon === ico.key;
                        const IconC = ico.Icon;
                        return (
                          <button
                            key={ico.key}
                            type="button"
                            className={`btn-ghost h-7 w-7 !p-0 !justify-center ${isSelected ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                            title={ico.label}
                            onClick={() => handleChangeIcon(tag.id, ico.key)}
                            aria-label={`Set icon to ${ico.label}`}
                          >
                            <IconC className="h-4 w-4" />
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="btn-icon ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded"
                        onClick={() => setIconPickerForTag(null)}
                        aria-label="Close icon picker"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </span>
              ) : (
                <IconComponent className="h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              {tag.name}
              {isEdit && (
                <button
                  type="button"
                  className="btn-icon ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full !p-0"
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
                className="btn-ghost inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[0.72rem] text-muted-foreground hover:text-foreground"
                onClick={() => setShowTagInput(true)}
                data-testid="add-tag-button"
              >
                + tag
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                {pendingTagName ? (
                  /* ── Color + icon picker for new tag ── */
                  <div className="relative flex flex-col gap-1.5 rounded-md border border-hairline bg-panel px-2 py-1.5 pr-6" data-testid="color-picker">
                    <span className="font-mono text-[0.7rem] text-muted-foreground">
                      New tag: "{pendingTagName}"
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="mr-0.5 font-mono text-[0.6rem] text-muted-foreground">Color</span>
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
                    <div className="flex items-center gap-1">
                      <span className="mr-0.5 font-mono text-[0.6rem] text-muted-foreground">Icon</span>
                      {TAG_ICONS.map((ico) => {
                        const isSelected = pendingTagIcon === ico.key;
                        const IconC = ico.Icon;
                        return (
                          <button
                            key={ico.key}
                            type="button"
                            className={`btn-ghost h-6 w-6 !p-0 !justify-center ${isSelected ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                            title={ico.label}
                            onClick={() => handlePickIcon(ico.key)}
                            aria-label={`Icon: ${ico.label}`}
                          >
                            <IconC className="h-3.5 w-3.5" />
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="absolute right-1 top-1 text-muted-foreground hover:text-foreground"
                      onClick={() => { setPendingTagName(null); setPendingTagIcon("circle"); }}
                      aria-label="Cancel tag creation"
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

                {/* Combined dropdown: existing matching tags (≤ 2) + Create new */}
                {!pendingTagName && tagQuery.trim() && (
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-md border border-hairline bg-panel py-1 shadow-lg" data-testid="tag-suggestions">
                    {tagSuggestions.slice(0, 2).map((t) => {
                      const ti = getTagIcon(t.icon);
                      const TagIcon = ti.Icon;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className="btn-ghost flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px]"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectTag(t);
                          }}
                        >
                          <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          {t.name}
                        </button>
                      );
                    })}
                    {!tags.some((t) => t.name.toLowerCase() === tagQuery.trim().toLowerCase()) && (
                      <button
                        type="button"
                        className="btn-ghost flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px]"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleCreateTag(tagQuery.trim());
                        }}
                      >
                        <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        {tagQuery.trim()}
                        <span className="text-muted-foreground">— Create new</span>
                      </button>
                    )}
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
