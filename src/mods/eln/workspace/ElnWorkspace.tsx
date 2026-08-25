import { useRef, useEffect, useMemo, useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import { WorkspaceBus } from "../../../shell/src/workspace/WorkspaceBus";
import { SlotRenderer } from "../../../shell/src/workspace/SlotRenderer";
import { SlotSidebar } from "../../../shell/src/shared/components/Sidebar/SlotSidebar";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { SlotContext, BlockBinding } from "../../../shell/src/mod-system/types";
import type { ElnSidebarData } from "../blocks/sidebarData";
import { useSendAction } from "../../../shell/src/workspace/useSendAction";
import { TipTapRenderer } from "../../../shell/src/workspace/TipTapRenderer";
import { elnExtensions } from "../editor/extensions/elnExtensions";
import { useEntryWorkspace } from "../hooks/useEntryWorkspace";
import { useTaggableItems } from "../../tags/hooks";
import { attachTags, detachTag } from "../api";
import { useMentionContext } from "../../../shell/src/mentions/MentionProvider";
import { useActivity } from "../hooks/useActivity";
import { getRecentEditors } from "../activityHelpers";
import ElnChrome from "./ElnChrome";

interface ElnWorkspaceProps {
  entryId?: string;
}

function ElnWorkspace({ entryId }: ElnWorkspaceProps) {
  const entryDisplayId = entryId ?? "New";
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const isNew = searchParams.get("new") === "true";

  const initialFolderId: number | null = (() => {
    const raw = searchParams.get("folderId");
    if (raw) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  })();

  const initialProjectId: number | null = (() => {
    const raw = searchParams.get("projectId");
    if (raw) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  })();

  const busRef = useRef<WorkspaceBus>(null);
  if (!busRef.current) {
    busRef.current = new WorkspaceBus();
  }
  const bus = busRef.current;

  const workspace = useEntryWorkspace({
    entryId,
    isNew,
    initialFolderId,
    initialProjectId,
    projectUid: searchParams.get("project"),
  });

  const taggableItems = useTaggableItems({
    initialTags: workspace.entry?.tags ?? [],
    attachFn: !isNew && entryId
      ? async (tagIds: number[]) => {
          const updated = await attachTags(entryId, tagIds);
          workspace.save.applySavedEntry(updated);
        }
      : undefined,
    detachFn: !isNew && entryId
      ? async (tagId: number) => {
          const updated = await detachTag(entryId, tagId);
          workspace.save.applySavedEntry(updated);
        }
      : undefined,
    deferred: isNew,
  });

  const { isReady, error, errorStatus } = workspace;
  const { title, description, status, setTitle, setDescription, setStatus } = workspace.fields;
  const { folderId, folders, setFolderId } = workspace.folder;
  const { saveStatus, lastSavedAt, queueLength, save, deleteEntry } = workspace.save;
  const { isLockedByOther, lockHeldBy } = workspace.lock;
  const { tags, pendingTagIds, addTag, removeTag } = taggableItems;
  const editorRef = useRef<Editor | null>(null);

  const handleEditorCreate = useCallback((editor: Editor) => {
    editorRef.current = editor;
    workspace.editor.onUpdate(editor);
  }, [workspace.editor]);

  const handleAppendParagraph = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    editor.commands.focus("end");
  }, []);

  const editorBindings = useMemo(() => {
    const resolved = ModRegistry.getInstance().resolveSlot("eln.editor");
    if (!resolved) return [];
    return resolved.bindings.filter(
      (b): b is BlockBinding => b.type === "block",
    );
  }, []);

  const sendAction = useSendAction("eln");

  const { actions } = useActivity(entryId);
  const recentEditors = getRecentEditors(actions);
  const lastEditor = actions.length > 0 ? actions[0].performed_by : null;

  const { resolutionMap, resolveIds } = useMentionContext();
  useEffect(() => {
    const mentions = workspace.entry?.mentions;
    if (mentions && mentions.length > 0) {
      const ids = mentions
        .map((m) => m.target_display_id)
        .filter((id): id is string => id !== null);
      if (ids.length > 0) resolveIds(ids);
    }
  }, [workspace.entry?.mentions, resolveIds]);

  const folderPath = workspace.entry?.folder_path || "";
  const projectId = workspace.entry?.project ?? initialProjectId;
  const contextFolderId = folderId ?? workspace.entry?.folder ?? null;

  const slotContext: SlotContext = useMemo(
    () => ({
      workspaceId: "eln",
      user: null,
      viewMode: "edit",
      entryId,
      displayId: entryDisplayId,
      actions: ModRegistry.getInstance().getActions("eln"),
      entry: {
        entry: workspace.entry,
        lastEditor,
        status,
        folders,
         folderId: contextFolderId,
        projectId,
        isLockedByOther,
        onStatusChange: setStatus,
        onFolderChange: setFolderId,
        resolutionMap,
        mentions: workspace.entry?.mentions ?? [],
        navigate: (path: string) => navigate(path),
      } satisfies ElnSidebarData,
    }),
    [
      entryId, entryDisplayId, workspace.entry, lastEditor, status,
       folders, folderId, contextFolderId, projectId, isLockedByOther,
       setStatus, setFolderId,
      resolutionMap, navigate,
    ],
  );

  const prevLastSavedAtRef = useRef<Date | null>(null);
  useEffect(() => {
    const current = lastSavedAt;
    if (current === null) return;
    if (prevLastSavedAtRef.current === null) {
      prevLastSavedAtRef.current = current;
      return;
    }
    if (prevLastSavedAtRef.current.getTime() === current.getTime()) return;
    prevLastSavedAtRef.current = current;

    bus.emit("eln.entry.saved", {
      entryId: workspace.entry?.display_id ?? entryId,
    });
  }, [lastSavedAt, workspace.entry?.display_id, entryId, bus]);

  const handleSave = useCallback(() => {
    save(isNew ? pendingTagIds : undefined);
  }, [save, isNew, pendingTagIds]);

  const headerActions = (
    <SlotRenderer
      slotId="eln.header-actions"
      bus={bus}
      context={slotContext}
    />
  );

  const editorElement = (
    <TipTapRenderer
      key={entryId ?? "new"}
      slotId="eln.editor"
      bindings={editorBindings}
      bus={bus}
      context={slotContext}
      content={workspace.editor.content}
      extensions={elnExtensions}
      onCreate={handleEditorCreate}
      onUpdate={workspace.editor.onUpdate}
      editable={workspace.editor.editable}
      saveSignal={workspace.editor.saveSignal}
      targetId={workspace.editor.targetId}
      onFlushActions={sendAction}
      hasPendingRef={workspace.editor.hasPendingRef}
    />
  );

  const sidebarElement = (
    <SlotSidebar
      slotId="eln.sidebar"
      context={slotContext}
      bus={bus}
    />
  );

  return (
    <ElnChrome
      isReady={isReady}
      error={error}
      errorStatus={errorStatus}
      isNew={isNew}
      entryDisplayId={entryDisplayId}
      entry={workspace.entry}
      projectUid={searchParams.get("project")}
      folderPath={folderPath}
      title={title}
      onTitleChange={setTitle}
      description={description}
      onDescriptionChange={setDescription}
      isLockedByOther={isLockedByOther}
      lockHeldBy={lockHeldBy}
      saveStatus={saveStatus}
      queueLength={queueLength}
      onSave={handleSave}
      onDelete={deleteEntry}
      tags={tags}
      onAddTag={addTag}
      onRemoveTag={removeTag}
      recentEditors={recentEditors}
      headerActions={headerActions}
      editor={editorElement}
      onAppendParagraph={handleAppendParagraph}
      sidebar={sidebarElement}
    />
  );
}

export default ElnWorkspace;
