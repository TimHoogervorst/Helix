import { collectPortableBlocks, registrationBaselines } from "./savedActionBlocks";
import { decodeBlockContent, getTypedPath } from "./portableInput";
import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import { WorkspaceBus } from "@helix/mod-api/host";
import { SlotRenderer } from "@helix/mod-api/host";
import { SlotSidebar } from "@helix/mod-api";
import { ModRegistry } from "@helix/mod-api/host";
import type { SlotContext, BlockBinding } from "@helix/mod-api/host";
import type { ElnSidebarData } from "../blocks/sidebarData";
import { useSendAction } from "@helix/mod-api/host";
import { TipTapRenderer } from "@helix/mod-api/editor";
import { elnExtensions } from "../editor/extensions/elnExtensions";
import { useEntryWorkspace } from "../hooks/useEntryWorkspace";
import { useTaggableItems } from "../tags/hooks/useTaggableItems";
import { attachTags, submitReview, withdrawReview, getReviewState, detachTag, listRenditions, type HistoricalRendition, type ReviewState } from "../api";
import { useMentionContext } from "@helix/mod-api/host";
import { useActivity } from "../hooks/useActivity";
import { getRecentEditors } from "../activityHelpers";
import ElnChrome from "./ElnChrome";
import ReviewThreadsPanel from "../components/ReviewThreadsPanel";
import { portableAttributeNodeTypes, preparePortableDocument, restorePortableDocument } from "../portableDocument";
import { PortableNodeAttributes } from "../editor/portableBlockExtensions";
import { ElnPortableBlockHostContext, type ElnPortableBlockHost } from "../editor/portableBlockExtensions";
import { get } from "@helix/mod-api/api";
import { invokeAction, resolvePortableActionContext } from "@helix/mod-api/portable-blocks";
import type { ActionContractDefinition, ActionContractEnvelope, ContractType } from "@helix/mod-api/contracts";
import type { ActionInvocationRequest } from "@helix/mod-api/host";

function contractKey(id: string, version: string) {
  return `action:${id}@${version}`;
}

interface RecordActionProvider {
  id: string;
  contract_id: string;
  contract_version: string;
  provider_mod_id: string;
  provider_mod_version: string;
}

type RecordInputSource = Extract<import("@helix/mod-api/portable-blocks").PortableInputSource, { kind: "record" }>;


function collectRecordSources(value: unknown, found = new Map<string, RecordInputSource>()): Map<string, RecordInputSource> {
  if (Array.isArray(value)) {
    for (const child of value) collectRecordSources(child, found);
  } else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const sequence = object.actionSequence as { steps?: Array<{ inputs?: Record<string, unknown> }> } | undefined;
    for (const step of sequence?.steps ?? []) {
      for (const source of Object.values(step.inputs ?? {})) {
        if (source && typeof source === "object" && (source as { kind?: unknown }).kind === "record") {
          const typed = source as RecordInputSource;
          const reference = typed.reference;
          if (reference?.fieldId) found.set(JSON.stringify(reference), typed);
        }
      }
    }
    for (const child of Object.values(object)) collectRecordSources(child, found);
  }
  return found;
}


function collectActionReferences(value: unknown, found = new Map<string, { id: string; version: string }>()) {
  if (Array.isArray(value)) {
    for (const child of value) collectActionReferences(child, found);
  } else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const sequence = object.actionSequence as { steps?: Array<{ action?: { id?: string; version?: string } }> } | undefined;
    for (const step of sequence?.steps ?? []) {
      const action = step.action;
      if (action?.id && action.version) found.set(contractKey(action.id, action.version), { id: action.id, version: action.version });
    }
    for (const child of Object.values(object)) collectActionReferences(child, found);
  }
  return found;
}

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
  const [renditions, setRenditions] = useState<HistoricalRendition[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const reviewRequestRef = useRef<{ id: string; payload: string } | null>(null);
  const withdrawRequestRef = useRef<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const savedInvocationEntryRef = useRef<typeof workspace.entry>(null);
  const [actionDefinitions, setActionDefinitions] = useState<Record<string, ActionContractDefinition>>({});
  const [recordActionProviders, setRecordActionProviders] = useState<RecordActionProvider[]>([]);
  const [selectedPortableProviders, setSelectedPortableProviders] = useState<Record<string, string>>({});
  const discoveryDocument = useMemo(() => decodeBlockContent(workspace.editor.content), [workspace.editor.content]);
  const actionReferences = useMemo(() => [...collectActionReferences(discoveryDocument).values()], [discoveryDocument]);
  const portableBlocks = useMemo(() => collectPortableBlocks(discoveryDocument), [discoveryDocument]);
  const recordInputSources = useMemo(() => [...collectRecordSources(discoveryDocument).entries()], [discoveryDocument]);
  const [recordInputValues, setRecordInputValues] = useState<Record<string, { type: ContractType; value: unknown }>>({});

  useEffect(() => {
    if (!entryId || isNew) {
      setRenditions([]);
      return;
    }
    let cancelled = false;
    void listRenditions(entryId)
      .then((items) => { if (!cancelled) setRenditions(items); })
      .catch(() => { if (!cancelled) setRenditions([]); });
    void getReviewState(entryId)
      .then((state) => { if (!cancelled) setReviewState(state); })
      .catch(() => { if (!cancelled) setReviewState(null); });
    return () => { cancelled = true; };
  }, [entryId, isNew]);

  const handleReview = useCallback(async () => {
    if (isNew || !entryId || isLockedByOther) return;
    setReviewing(true);
    setReviewError(null);
    try {
      // Drain the save queue first; use the exact committed Revision it returns.
      const saved = await workspace.save.save();
      if (!saved?.platform_state_token || !saved.document_revision_id) {
        throw new Error("Save the document before reviewing it.");
      }
      const payload = `${saved.platform_state_token}:${saved.document_revision_id}`;
      if (reviewRequestRef.current?.payload !== payload) {
        reviewRequestRef.current = { id: crypto.randomUUID(), payload };
      }
      const submission = await submitReview(saved.display_id, saved.platform_state_token, saved.document_revision_id, reviewRequestRef.current.id);
      reviewRequestRef.current = null;
      setReviewState({
        available: true,
        state: "submitted",
        locked: true,
        current_submission_id: submission.submission_id,
      });
      setRenditions(await listRenditions(saved.display_id));
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "The review rendition could not be captured.");
    } finally {
      setReviewing(false);
    }
  }, [entryId, isNew, isLockedByOther, workspace.save.save]);

  const handleWithdrawReview = useCallback(async () => {
    if (!entryId || reviewState?.state !== "submitted") return;
    setReviewing(true);
    setReviewError(null);
    try {
      if (!withdrawRequestRef.current) withdrawRequestRef.current = crypto.randomUUID();
      await withdrawReview(entryId, withdrawRequestRef.current);
      withdrawRequestRef.current = null;
      setReviewState((state) => state ? { ...state, state: "authoring", locked: false, current_submission_id: null } : state);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "The submission could not be withdrawn.");
    } finally {
      setReviewing(false);
    }
  }, [entryId, reviewState?.state]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(recordInputSources.map(async ([key, source]) => {
      const { reference } = source;
      const path = reference.mode === "exact" && reference.groupId && reference.revisionId
        ? `/records/${encodeURIComponent(reference.entityId)}/groups/${encodeURIComponent(reference.groupId)}/revisions/${encodeURIComponent(reference.revisionId)}`
        : `/records/${encodeURIComponent(reference.entityId)}`;
      try {
        const payload = await get<{ field_values?: Record<string, unknown>; snapshot?: { field_values?: Record<string, unknown> } }>(path);
        const fieldValues = payload.snapshot?.field_values ?? payload.field_values ?? {};
        const raw = fieldValues[reference.fieldId!];
        if (!raw || typeof raw !== "object") return [key, undefined] as const;
        const field = raw as { type?: unknown; contract?: { kind?: unknown; id?: unknown; version?: unknown }; value?: unknown };
        const type = field.contract && field.contract.kind === "data" && typeof field.contract.id === "string" && typeof field.contract.version === "string"
          ? { type: "contract", kind: "data", id: field.contract.id, version: field.contract.version } as ContractType
          : typeof field.type === "string" ? { type: field.type } as ContractType : undefined;
        return [key, type ? { type, value: field.value } : undefined] as const;
      } catch {
        return [key, undefined] as const;
      }
    })).then((loaded) => {
      if (!cancelled) setRecordInputValues(Object.fromEntries(loaded.filter((item): item is readonly [string, { type: ContractType; value: unknown }] => item[1] !== undefined)));
    });
    return () => { cancelled = true; };
  }, [recordInputSources]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(actionReferences.map(async ({ id, version }) => {
      const path = `/contracts/action/${encodeURIComponent(id)}/${encodeURIComponent(version)}`;
      try {
        const envelope = await get<ActionContractEnvelope>(path);
        return [contractKey(id, version), envelope.definition] as const;
      } catch {
        return null;
      }
    })).then((loaded) => {
      if (!cancelled) setActionDefinitions(Object.fromEntries(loaded.filter((item): item is NonNullable<typeof item> => item !== null)));
    });
    return () => { cancelled = true; };
  }, [actionReferences]);

  useEffect(() => {
    let cancelled = false;
    void get<{ recordActions?: RecordActionProvider[] }>("/mod-registry/").then((payload) => {
      if (!cancelled) setRecordActionProviders(payload.recordActions ?? []);
    }).catch(() => {
      if (!cancelled) setRecordActionProviders([]);
    });
    return () => { cancelled = true; };
  }, []);

  const handleAppendParagraph = useCallback(() => {
    if (workspace.save.actionBusy) return;
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    editor.commands.focus("end");
  }, [workspace.save.actionBusy]);

  const editorBindings = useMemo(() => {
    const resolved = ModRegistry.getInstance().resolveSlot("eln.editor");
    if (!resolved) return [];
    return resolved.bindings.filter(
      (b): b is BlockBinding => b.type === "block",
    );
  }, []);

  // ProseMirror schemas contain only the Block providers installed in this
  // deployment. Wrap unknown nodes/marks before parsing so editing a supported
  // sibling cannot make ProseMirror silently drop their saved JSON.
  const knownEditorNodes = useMemo(
    () => new Set(editorBindings.map((binding) => binding.id)),
    [editorBindings],
  );
  const portableEditorContent = useMemo(
    () => preparePortableDocument(workspace.editor.content, knownEditorNodes),
    [workspace.editor.content, knownEditorNodes],
  );
  const editorExtensions = useMemo(() => [
    ...elnExtensions,
    PortableNodeAttributes.configure({ types: portableAttributeNodeTypes(knownEditorNodes) }),
  ], [knownEditorNodes]);
  const handleEditorUpdate = useCallback((editor: Editor) => {
    workspace.editor.onUpdateContent(
      restorePortableDocument(editor.getJSON() as Record<string, unknown>),
    );
  }, [workspace.editor.onUpdateContent]);
  const handleEditorCreate = useCallback((editor: Editor) => {
    if (!editor.isDestroyed) handleEditorUpdate(editor);
  }, [handleEditorUpdate]);

  const sendAction = useSendAction("eln");

  const [editorGeneration, setEditorGeneration] = useState(0);
  const committedActionRef = useRef(false);
  const createdIdsRef = useRef(new Set<string>());
  const synchronizingRef = useRef(false);
  const synchronizeAction = useCallback(async () => {
    if (synchronizingRef.current) return;
    synchronizingRef.current = true;
    try {
      const saved = await get<NonNullable<typeof workspace.entry>>(`/eln/entries/${entryId}/`);
      const displayContent = registrationBaselines(saved.content, createdIdsRef.current);
      // Adopt the committed document through the same initial-content path as
      // opening an entry. Never dispatch commands through a captured editor.
      workspace.save.finishAction({ ...saved, content: displayContent });
      setEditorGeneration((generation) => generation + 1);
      committedActionRef.current = false;
      bus.emit("eln.entry.saved", { entryId });
    } finally {
      synchronizingRef.current = false;
    }
  }, [entryId, workspace.save.finishAction, bus]);

  const beforePortableAction = useCallback(async () => {
    if (!entryId) throw new Error("Save this Notebook Entry before invoking an Action.");
    const saved = await workspace.save.beginAction();
    if (!saved?.platform_record_id || !saved.platform_state_token || !saved.document_group_id || !saved.document_revision_id
      || !saved.platform_record_revision_id || !saved.platform_schema_state) {
      workspace.save.finishAction();
      throw new Error("The committed Platform document state is unavailable; the Action was not invoked.");
    }
    savedInvocationEntryRef.current = saved;
  }, [entryId, workspace.save.beginAction, workspace.save.finishAction]);

  const invokePortableAction = useCallback(async (request: ActionInvocationRequest) => {
    try {
      const outcome = await invokeAction(request);
      createdIdsRef.current = new Set(Object.values(outcome.createdRecords ?? {}).map((record) => record.id));
      committedActionRef.current = true;
      await synchronizeAction();
      return { ...outcome, documentAdopted: true };
    } catch (error) {
      if (!committedActionRef.current) workspace.save.finishAction();
      throw error;
    }
  }, [synchronizeAction, workspace.save.finishAction]);

  const portableBlockHost: ElnPortableBlockHost = useMemo(() => ({
    actionDefinitions,
    providerOptions: (block, stepId) => {
      const step = block.actionSequence?.steps.find((candidate) => candidate.id === stepId);
      if (!step) return [];
      return recordActionProviders.filter((provider) =>
        provider.contract_id === step.action.id && provider.contract_version === step.action.version,
      ).map((provider) => ({
        id: provider.id,
        label: `${provider.provider_mod_id}@${provider.provider_mod_version}`,
      }));
    },
    selectedProvider: (block, stepId) => selectedPortableProviders[`${block.id}.${stepId}`],
    selectProvider: (block, stepId, providerId) => {
      setSelectedPortableProviders((current) => ({ ...current, [`${block.id}.${stepId}`]: providerId }));
    },
    actionContext: (block, stepId) => {
      const step = block.actionSequence?.steps.find((candidate) => candidate.id === stepId);
      const compatibleProviders = step ? recordActionProviders.filter((provider) =>
        provider.contract_id === step.action.id && provider.contract_version === step.action.version,
      ) : [];
      const selectedProviderId = selectedPortableProviders[`${block.id}.${stepId}`];
      const selectedProvider = compatibleProviders.find((provider) => provider.id === selectedProviderId) ?? compatibleProviders[0];
      const providerAvailable = !!selectedProvider;
      return resolvePortableActionContext(block, stepId, actionDefinitions, {
        available: providerAvailable,
        ...(selectedProvider
          ? { provider: `${selectedProvider.provider_mod_id}@${selectedProvider.provider_mod_version}` }
          : { reason: "No compatible Action provider is installed." }),
      }, {
        record: (source) => recordInputValues[JSON.stringify(source.reference)],
        block: (source) => {
          const target = portableBlocks.get(source.blockId);
          if (!target?.content) return undefined;
          return source.path.length === 0
            ? target.content
            : getTypedPath(target.content.value, source.path);
        },
      });
    },
    buildInvocation: (block, stepId): ActionInvocationRequest => {
      try {
        const saved = savedInvocationEntryRef.current;
        if (!saved?.platform_record_id || !saved.platform_state_token || !saved.document_group_id || !saved.document_revision_id
          || !saved.platform_record_revision_id || !saved.platform_schema_state) {
          throw new Error("Save the document before invoking this Action.");
        }
        const savedBlocks = collectPortableBlocks(decodeBlockContent(saved.content));
        const savedBlock = savedBlocks.get(block.id);
        if (!savedBlock) throw new Error("The Block is missing from the saved document.");
        block = savedBlock;
        const step = block.actionSequence?.steps.find((candidate) => candidate.id === stepId);
        if (!step) throw new Error(`Action step '${stepId}' is no longer present in the saved Block.`);
        const compatibleProviders = recordActionProviders.filter((provider) =>
          provider.contract_id === step.action.id && provider.contract_version === step.action.version,
        );
        const selectedProviderId = selectedPortableProviders[`${block.id}.${stepId}`];
        const selectedProvider = compatibleProviders.find((provider) => provider.id === selectedProviderId) ?? compatibleProviders[0];
        const context = resolvePortableActionContext(block, stepId, actionDefinitions, {
          available: !!selectedProvider,
        }, {
          record: (source) => recordInputValues[JSON.stringify(source.reference)],
          block: (source) => {
            const target = savedBlocks.get(source.blockId);
            if (!target?.content) return undefined;
            return source.path.length === 0
              ? target.content
              : getTypedPath(target.content.value, source.path);
          },
        });
        if (!context.available) throw new Error(context.reason ?? "This exact Action is unavailable.");
        const targets = Object.keys(step.targets);
        if (targets.length !== 1 || targets[0] !== "record") {
          throw new Error("This ELN host can invoke Actions with one Platform record target.");
        }
        const unwrap = (ports: Readonly<Record<string, { value?: unknown }>>) => Object.fromEntries(
          Object.entries(ports).map(([name, port]) => {
            if (port.value === undefined) throw new Error(`Action input or parameter '${name}' is unresolved.`);
            return [name, port.value];
          }),
        );
        return {
          invocationId: crypto.randomUUID(),
          sequenceFingerprint: block.actionSequence!.fingerprint,
          sequenceDeclaration: block.actionSequence as unknown as Readonly<Record<string, unknown>>,
          inputs: unwrap(context.inputs),
          parameters: unwrap(context.parameters),
          targets: { record: saved.platform_record_id },
          expectedState: { record: {
            stateToken: saved.platform_state_token,
            revisionId: saved.platform_record_revision_id,
            schemaState: saved.platform_schema_state,
            documentGroupId: saved.document_group_id,
            documentRevisionId: saved.document_revision_id,
          } },
          providers: { action: selectedProvider!.id },
        };
      } catch (error) {
        workspace.save.finishAction();
        throw error;
      }
    },
    beforeInvoke: beforePortableAction,
    invokeAction: invokePortableAction,
    invokeStep: async (block, stepId) => {
      await beforePortableAction();
      try {
        return await invokePortableAction(portableBlockHost.buildInvocation(block, stepId));
      } catch (error) {
        if (!committedActionRef.current) workspace.save.finishAction();
        throw error;
      }
    },
  }), [actionDefinitions, recordActionProviders, selectedPortableProviders, recordInputValues, portableBlocks, beforePortableAction, invokePortableAction, workspace.save.finishAction]);

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

  const folderPath = (workspace.entry?.source_path || [])
    .filter((segment) => segment.kind === "folder")
    .map((segment) => segment.name)
    .join("/");
  const projectId = workspace.entry?.project ?? initialProjectId;
  const contextFolderId = folderId ?? null;

  const slotContext: SlotContext = useMemo(
    () => ({
      workspaceId: "eln",
      user: null,
      viewMode: workspace.save.actionBusy ? "view" : "edit",
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
        onStatusChange: (value) => { if (!workspace.save.actionBusy) setStatus(value); },
        onFolderChange: (value) => { if (!workspace.save.actionBusy) setFolderId(value); },
        resolutionMap,
        mentions: workspace.entry?.mentions ?? [],
        navigate: (path: string) => navigate(path),
      } satisfies ElnSidebarData,
    }),
    [
      entryId, entryDisplayId, workspace.entry, lastEditor, status,
       folders, folderId, contextFolderId, projectId, isLockedByOther,
       setStatus, setFolderId,
      resolutionMap, navigate, workspace.save.actionBusy,
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
    if (workspace.save.actionBusy) return;
    void save(isNew ? pendingTagIds : undefined).catch(() => {});
  }, [save, isNew, pendingTagIds, workspace.save.actionBusy]);

  const headerActions = (
    <SlotRenderer
      slotId="eln.header-actions"
      bus={bus}
      context={slotContext}
    />
  );

  const editorElement = (
    <>
    <ElnPortableBlockHostContext.Provider value={portableBlockHost}>
    <fieldset disabled={workspace.save.actionBusy || reviewState?.locked === true} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <TipTapRenderer
      key={`${entryId ?? "new"}:${editorGeneration}`}
      editorRef={editorRef}
      slotId="eln.editor"
      bindings={editorBindings}
      bus={bus}
      context={slotContext}
      content={portableEditorContent}
      extensions={editorExtensions}
      onCreate={handleEditorCreate}
      onUpdate={handleEditorUpdate}
      editable={workspace.editor.editable && reviewState?.locked !== true}
      saveSignal={workspace.editor.saveSignal}
      targetId={workspace.editor.targetId}
      onFlushActions={sendAction}
      hasPendingRef={workspace.editor.hasPendingRef}
    />
    </fieldset>
    </ElnPortableBlockHostContext.Provider>
    {!isNew && entryDisplayId && <ReviewThreadsPanel displayId={entryDisplayId} reviewState={reviewState} editor={editorRef.current} onReviewStateChanged={setReviewState} save={workspace.save.save} />}
    </>
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
      discussionRecordId={workspace.entry?.platform_record_id}
    projectUid={searchParams.get("project")}
    folderPath={folderPath}
    sourcePath={workspace.entry?.source_path}
      title={title}
      onTitleChange={(value) => { if (!workspace.save.actionBusy) setTitle(value); }}
      description={description}
      onDescriptionChange={(value) => { if (!workspace.save.actionBusy) setDescription(value); }}
      isLockedByOther={isLockedByOther}
      lockHeldBy={lockHeldBy}
      saveStatus={saveStatus}
      queueLength={queueLength}
      onSave={handleSave}
      onReview={() => { void handleReview(); }}
      onWithdrawReview={() => { void handleWithdrawReview(); }}
      reviewState={reviewState}
      reviewing={reviewing}
      reviewError={reviewError}
      renditions={renditions}
      onDelete={deleteEntry}
      tags={tags}
      onAddTag={(tag) => { if (!workspace.save.actionBusy) void addTag(tag); }}
      onRemoveTag={(id) => { if (!workspace.save.actionBusy) void removeTag(id); }}
      recentEditors={recentEditors}
      headerActions={headerActions}
      editor={editorElement}
      onAppendParagraph={handleAppendParagraph}
      sidebar={sidebarElement}
    />
  );
}

export default ElnWorkspace;
