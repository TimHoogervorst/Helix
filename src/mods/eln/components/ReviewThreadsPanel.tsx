import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Button, Textarea } from "@helix/mod-api/host";
import {
  addReviewThread, amendReviewThreadMessage, approveReview, assessReview, changeReviewThread, finishReview, getReviewState, disposeReviewSuggestion, getReviewThreads, reopenReview,
  replyReviewThread, retractReviewThreadMessage, startReviewParticipation,
  type ReviewState, type ReviewThread, type ReviewThreadsState,
} from "../api";

function name(person: { displayName?: string; username?: string }) {
  return person.displayName || person.username || "Former user";
}

function approvalRequestFor(displayId: string, submissionId: string, assessment: string) {
  const key = `helix.review.approval.${displayId}.${submissionId}`;
  let requests: Record<string, string> = {};
  try { requests = JSON.parse(sessionStorage.getItem(key) || "{}"); } catch { /* Start a fresh request identity. */ }
  const requestId = requests[assessment] || crypto.randomUUID();
  requests[assessment] = requestId;
  try { sessionStorage.setItem(key, JSON.stringify(requests)); } catch { /* The in-memory request ID still supports retries in this page. */ }
  return { key, requestId };
}

function forgetApprovalRequest(key: string, assessment: string) {
  try {
    const requests: Record<string, string> = JSON.parse(sessionStorage.getItem(key) || "{}");
    delete requests[assessment];
    if (Object.keys(requests).length) sessionStorage.setItem(key, JSON.stringify(requests));
    else sessionStorage.removeItem(key);
  } catch { try { sessionStorage.removeItem(key); } catch { /* Storage can be unavailable in restricted contexts. */ } }
}

function blockRange(doc: Editor["state"]["doc"], path: unknown): { from: number; to: number } | null {
  if (!Array.isArray(path) || !path.every((index) => Number.isInteger(index) && index >= 0)) return null;
  let node = doc;
  let nodePos = -1;
  for (const index of path as number[]) {
    if (index >= node.childCount) return null;
    let offset = 0;
    for (let sibling = 0; sibling < index; sibling++) offset += node.child(sibling).nodeSize;
    nodePos += 1 + offset;
    node = node.child(index);
  }
  return { from: nodePos, to: nodePos + node.nodeSize };
}

function ReviewThreadMessage({ displayId, threadId, message, onChanged, run }: {
  displayId: string; threadId: string;
  message: ReviewThread["messages"][number];
  onChanged: () => Promise<void>;
  run: (operation: () => Promise<unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(message.body);
  return <article className="border-l-2 border-border pl-3 text-sm">
    <p><strong>{name(message.author)}:</strong> {message.retracted ? "Message retracted" : message.body}</p>
    {editing && <div className="mt-2 space-y-2"><Textarea aria-label="Amend review message" value={body} onChange={(event) => setBody(event.target.value)} />
      <div className="flex gap-2"><Button variant="primary" size="sm" disabled={!body.trim()} onClick={() => run(async () => { await amendReviewThreadMessage(displayId, threadId, message.id, body); setEditing(false); await onChanged(); })}>Save amendment</Button>
        <Button variant="ghost" size="sm" onClick={() => { setBody(message.body); setEditing(false); }}>Cancel</Button></div></div>}
    {message.can_change && !editing && !message.retracted && <div className="mt-1 flex gap-2">
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Amend</Button>
      <Button variant="destructive" size="sm" onClick={() => run(async () => { await retractReviewThreadMessage(displayId, threadId, message.id); await onChanged(); })}>Retract</Button>
    </div>}
    {message.history.length > 1 && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Message history</summary>
      <ol className="mt-1 space-y-1">{message.history.map((revision, index) => <li key={`${message.id}-${index}`}>{revision.action === "create" ? "Original" : revision.action === "amend" ? "Amended" : "Retracted"} by {name(revision.actor)} · {new Date(revision.created_at).toLocaleString()}{revision.action !== "retract" && <blockquote className="border-l border-border pl-2">{revision.body}</blockquote>}</li>)}</ol>
    </details>}
  </article>;
}

export default function ReviewThreadsPanel({ displayId, reviewState, editor, onReviewStateChanged, save }: {
  displayId: string; reviewState: ReviewState | null; editor: Editor | null; save: () => Promise<{ document_revision_id?: string | null } | null>;
  onReviewStateChanged: (state: ReviewState) => void;
}) {
  const [state, setState] = useState<ReviewThreadsState>({ participation: null, threads: [] });
  const [draft, setDraft] = useState("");
  const [replacementDraft, setReplacementDraft] = useState("");
  const [assessment, setAssessment] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const approvalRequestId = useRef<string | null>(null);
  const submissionId = reviewState?.current_submission_id;
  const active = reviewState?.state === "submitted" && Boolean(submissionId);
  const reviewable = (reviewState?.state === "submitted" || reviewState?.state === "finished") && Boolean(submissionId);
  const refresh = useCallback(async () => {
    try { setState(await getReviewThreads(displayId)); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Review feedback could not be loaded."); }
  }, [displayId]);
  useEffect(() => { void refresh(); }, [refresh, submissionId]);
  useEffect(() => {
    if (!editor) return;
    editor.commands.setReviewAnnotations(state.threads.flatMap((thread) => {
      if (thread.anchor.submission_id !== submissionId) return [];
      if (thread.anchor.kind === "text" && typeof thread.anchor.from === "number" && typeof thread.anchor.to === "number") {
        return [{ id: thread.id, kind: "text" as const, from: thread.anchor.from, to: thread.anchor.to }];
      }
      if (thread.anchor.kind === "block") {
        const range = blockRange(editor.state.doc, thread.anchor.block_path);
        return range ? [{ id: thread.id, kind: "block" as const, ...range }] : [];
      }
      return [];
    }));
  }, [editor, state.threads, submissionId]);

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The review action could not be saved."); }
    finally { setBusy(false); }
  };
  const start = () => void run(() => startReviewParticipation(displayId));
  const comment = (kind: "text" | "document", suggestReplacement = false) => {
    if (!submissionId || !editor) return;
    const selection = editor.state.selection;
    const text = kind === "text" ? editor.state.doc.textBetween(selection.from, selection.to, "\n") : "";
    const anchor = {
      submission_id: submissionId, group_key: "document",
      revision_id: reviewState?.submissions?.find((item) => item.id === submissionId)?.manifest?.groups?.document?.revision_id,
      kind, from: selection.from, to: selection.to, text,
    };
    void run(async () => { await addReviewThread(displayId, submissionId, anchor, draft, suggestReplacement ? replacementDraft : undefined); setDraft(""); setReplacementDraft(""); });
  };
  const commentOnBlock = () => {
    if (!submissionId || !editor) return;
    const $from = editor.state.selection.$from;
    let depth = $from.depth;
    while (depth > 0 && !$from.node(depth).isTextblock) depth--;
    if (!depth) return;
    const block = $from.node(depth);
    const anchor = {
      submission_id: submissionId, group_key: "document",
      revision_id: reviewState?.submissions?.find((item) => item.id === submissionId)?.manifest?.groups?.document?.revision_id,
      kind: "block", block_path: Array.from({ length: depth }, (_, index) => $from.index(index)),
      text: block.textContent,
    };
    void run(async () => { await addReviewThread(displayId, submissionId, anchor, draft); setDraft(""); });
  };
  const reply = (thread: ReviewThread) => void run(async () => {
    await replyReviewThread(displayId, thread.id, replyDrafts[thread.id] ?? "");
    setReplyDrafts((current) => ({ ...current, [thread.id]: "" }));
  });
  const approve = () => {
    if (!window.confirm("Approval resolves your outstanding requests, publishes this assessment as your witness comment, and finishes this target. Another reviewer's outstanding request will prevent approval. Continue?")) return;
    if (!submissionId) return;
    const savedRequest = approvalRequestFor(displayId, submissionId, assessment.trim());
    approvalRequestId.current = savedRequest.requestId;
    const requestId = savedRequest.requestId;
    void run(async () => {
      await approveReview(displayId, assessment, requestId);
      const nextState = await getReviewState(displayId);
      onReviewStateChanged(nextState);
      approvalRequestId.current = null;
      forgetApprovalRequest(savedRequest.key, assessment.trim());
    });
  };
  const reopen = () => {
    const reason = window.prompt("Reason for reopening this finished work:");
    if (!reason?.trim()) return;
    void run(async () => {
      await reopenReview(displayId, reason);
      onReviewStateChanged(await getReviewState(displayId));
    });
  };
  const applySuggestion = (thread: ReviewThread) => void run(async () => {
    if (!editor) throw new Error("The document editor is unavailable.");
    const source = await save();
    if (!source?.document_revision_id) throw new Error("Save the current document before applying a suggestion.");
    const selected = String(thread.anchor.text ?? "");
    const replacement = thread.suggestion.replacement;
    if (!selected || !replacement) throw new Error("This replacement suggestion is incomplete.");
    const matches: Array<{ from: number; to: number }> = [];
    editor.state.doc.descendants((node, pos, parent) => {
      if ((node.type.name !== "paragraph" && node.type.name !== "heading") || !parent || (parent.type.name !== "doc" && !(node.type.name === "paragraph" && parent.type.name === "listItem"))) return;
      const content = node.textContent;
      let offset = content.indexOf(selected);
      while (offset >= 0) {
        let remaining = offset;
        let from: number | null = null;
        let to: number | null = null;
        node.forEach((child, childOffset) => {
          if (!child.isText) return;
          const start = Math.max(0, remaining);
          const end = Math.min(child.text!.length, offset + selected.length - childOffset);
          if (start < end) {
            if (from === null) from = pos + 1 + childOffset + start;
            to = pos + 1 + childOffset + end;
          }
        });
        if (from !== null && to !== null) matches.push({ from, to });
        offset = content.indexOf(selected, offset + 1);
      }
    });
    if (matches.length !== 1) throw new Error(matches.length ? "The selected text is ambiguous in the current document." : "The selected text is stale. Refresh the document and review the suggestion.");
    const { from, to } = matches[0];
    editor.chain().focus().insertContentAt({ from, to }, replacement).run();
    const saved = await save();
    if (!saved?.document_revision_id) throw new Error("Save the replacement before recording it as applied.");
    await disposeReviewSuggestion(displayId, thread.id, "apply", saved.document_revision_id, from, source.document_revision_id);
  });
  if (!reviewState?.submissions?.length) return null;
  return <section aria-label="Submission review feedback" className="mx-auto my-6 w-full max-w-4xl border-t border-border px-6 py-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Review feedback</h2><p className="text-sm text-muted-foreground">Stored participation and comments for {reviewable ? "the current submission" : "the latest submission"}.</p></div>
      {active && !state.participation && <Button variant="primary" size="md" disabled={busy} onClick={start}>Start review</Button>}
      {state.participation && <span className="rounded bg-muted px-2 py-1 text-sm">{state.participation.state.replaceAll("_", " ")}</span>}
      {state.can_reopen && <Button variant="ghost" size="md" disabled={busy} onClick={reopen}>Reopen finished work</Button>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {!active && editor && state.threads.filter((thread) => thread.suggestion.replacement && thread.suggestion_disposition === "pending").map((thread) => <article key={`suggestion-${thread.id}`} className="mt-3 rounded border border-border bg-card p-3">
      <p className="text-sm font-medium">Suggested replacement</p>
      <p className="mt-1 text-sm text-muted-foreground">“{String(thread.anchor.text ?? "")}” → “{thread.suggestion.replacement}”</p>
      {thread.can_dispose_suggestion && <div className="mt-2 flex gap-3"><Button variant="ghost" size="sm" disabled={busy} onClick={() => applySuggestion(thread)}>Apply suggestion</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => disposeReviewSuggestion(displayId, thread.id, "reject"))}>Reject suggestion</Button></div>}
    </article>)}
    {state.approval_available === false && state.approval_unavailable_reason && <p role="status" data-approval-category={state.approval_unavailable_category || "readiness"} className="my-3 text-sm text-muted-foreground"><strong>{state.approval_unavailable_category === "access" ? "Review access required." : state.approval_unavailable_category === "attribution" ? "Contributor history." : state.approval_unavailable_category === "exclusion" ? "Witness eligibility." : state.approval_unavailable_category === "blockers" ? "Blocking feedback." : "Approval readiness."}</strong> {state.approval_unavailable_reason}</p>}
    {state.approval && <div className="my-4 rounded border border-border p-3" role="status"><p className="font-medium">Approved by {name(state.approval.witness)} · {new Date(state.approval.approved_at).toLocaleString()}</p><p className="mt-1 text-sm">{state.approval.assessment}</p></div>}
    {reviewable && state.participation && <>
      <div className="my-4 space-y-2 rounded border border-border p-3">
        <label className="block text-sm font-medium" htmlFor="review-feedback-draft">Add feedback</label>
        <Textarea className="min-h-16 w-full" id="review-feedback-draft" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe the requested change or concern" />
        {!editor?.state.selection.empty && <label className="block text-sm">Suggested replacement<Textarea className="mt-1 min-h-12 w-full" aria-label="Suggested replacement" maxLength={5000} value={replacementDraft} onChange={(event) => setReplacementDraft(event.target.value)} placeholder="Optional; replaces only the selected text" /></label>}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="md" disabled={busy || !draft.trim() || !editor || !editor.state.selection.empty} onClick={() => comment("document")}>Comment on document</Button>
          <Button variant="ghost" size="md" disabled={busy || !draft.trim() || !editor || editor.state.selection.empty} onClick={() => comment("text")}>Comment on selected text</Button>
          <Button variant="ghost" size="md" disabled={busy || !draft.trim() || !replacementDraft.trim() || !editor || editor.state.selection.empty} onClick={() => comment("text", true)}>Suggest replacement</Button>
          <Button variant="ghost" size="md" disabled={busy || !draft.trim() || !editor} onClick={commentOnBlock}>Comment on block</Button>
        </div>
      </div>
      <div className="space-y-3">{state.threads.map((thread) => <article id={`review-thread-${thread.id}`} key={thread.id} className="rounded border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{name(thread.requester)} · {thread.state}</span>{thread.blocking && <span className="rounded bg-destructive/10 px-2 py-0.5 text-destructive">Blocks review</span>}</div>
        <p className="mt-1 text-xs text-muted-foreground">Original submission {thread.original_submission_id.slice(0, 8)} · {String(thread.anchor.kind)}{typeof thread.anchor.text === "string" && thread.anchor.text ? `: “${thread.anchor.text}”` : ""}</p>
        {thread.original_submission_id !== submissionId && (() => { const historical = reviewState?.submissions?.find((item) => item.id === thread.original_submission_id); return historical?.download_url ? <a className="mt-1 inline-block text-xs text-primary underline" href={historical.download_url} target="_blank" rel="noreferrer">Open the exact frozen submission</a> : null; })()}
        {thread.suggestion.replacement && <p className="mt-1 text-xs text-muted-foreground">Suggested replacement: “{thread.suggestion.replacement}” · {thread.suggestion_disposition}</p>}
        {active && thread.suggestion_disposition === "pending" && thread.suggestion.replacement && <p className="mt-1 text-xs text-muted-foreground">Withdraw the submission to apply or reject this suggestion.</p>}
        {thread.anchor.kind === "text" && thread.anchor.submission_id === submissionId && editor && typeof thread.anchor.from === "number" && typeof thread.anchor.to === "number" && <Button variant="ghost" size="sm" className="mt-1" onClick={() => editor.chain().focus().setTextSelection({ from: thread.anchor.from as number, to: thread.anchor.to as number }).scrollIntoView().run()}>Show selected text</Button>}
        {thread.anchor.kind === "block" && thread.anchor.submission_id === submissionId && editor && (() => { const range = blockRange(editor.state.doc, thread.anchor.block_path); return range ? <Button variant="ghost" size="sm" className="mt-1" onClick={() => editor.chain().focus().setNodeSelection(range.from).scrollIntoView().run()}>Show block</Button> : null; })()}
        <div className="mt-3 space-y-2">{thread.messages.map((message) => <ReviewThreadMessage key={message.id} displayId={displayId} threadId={thread.id} message={message} onChanged={refresh} run={run} />)}</div>
        {thread.can_address && <Button variant="ghost" size="sm" className="mt-2" disabled={busy} onClick={() => void run(() => changeReviewThread(displayId, thread.id, "address"))}>Mark Addressed</Button>}
        {thread.can_resolve && <div className="mt-2 flex gap-3"><Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => changeReviewThread(displayId, thread.id, "resolve"))}>Resolve request</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => changeReviewThread(displayId, thread.id, "withdraw"))}>Withdraw request</Button></div>}
        {reviewable && (thread.state === "open" || thread.state === "addressed") && <div className="mt-3 flex gap-2"><Textarea className="min-h-9 flex-1" aria-label="Reply to review feedback" value={replyDrafts[thread.id] ?? ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [thread.id]: event.target.value }))} /><Button variant="ghost" size="md" className="self-end" disabled={busy || !(replyDrafts[thread.id] ?? "").trim()} onClick={() => reply(thread)}>Reply</Button></div>}
      </article>)}</div>
      {state.participation.state !== "finished" && <div className="mt-4 rounded border border-border p-3"><label htmlFor="review-assessment" className="text-sm font-medium">Final assessment</label><Textarea className="mt-2 min-h-16 w-full" id="review-assessment" value={assessment} onChange={(event) => setAssessment(event.target.value)} /><div className="mt-2 flex flex-wrap gap-2">{active ? <>{state.threads.some((thread) => thread.requester_is_actor && thread.blocking) && <Button variant="ghost" size="md" disabled={busy || !assessment.trim()} onClick={() => void run(() => assessReview(displayId, assessment))}>Request changes</Button>}<Button variant="primary" size="md" disabled={busy || !assessment.trim() || !state.approval_available} title={state.approval_unavailable_reason || "Approve and finish this target"} onClick={approve}>Approve and finish target</Button></> : <Button variant="primary" size="md" disabled={busy || !assessment.trim()} onClick={() => void run(async () => { await finishReview(displayId, assessment); setAssessment(""); })}>Finish review</Button>}</div>{!active && <p className="mt-2 text-sm text-muted-foreground">This submission is already finished. You can record your assessment and finish your participation; approval and Request changes are unavailable.</p>}</div>}
      {state.participation.state !== "finished" && <div className="mt-4 rounded border border-border p-3"><label htmlFor="review-assessment" className="text-sm font-medium">Final assessment</label><textarea id="review-assessment" className="mt-2 min-h-16 w-full rounded border border-input bg-background p-2 text-sm" value={assessment} onChange={(event) => setAssessment(event.target.value)} /><div className="mt-2 flex flex-wrap gap-2">{active ? <>{state.threads.some((thread) => thread.requester_is_actor && thread.blocking) && <button type="button" className="rounded border border-border px-3 py-2 text-sm" disabled={busy || !assessment.trim()} onClick={() => void run(() => assessReview(displayId, assessment))}>Request changes</button>}<button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" disabled={busy || !assessment.trim() || !state.approval_available} title={state.approval_unavailable_reason || "Approve and finish this target"} onClick={approve}>Approve and finish target</button></> : <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" disabled={busy || !assessment.trim()} onClick={() => void run(async () => { await finishReview(displayId, assessment); setAssessment(""); })}>Finish review</button>}</div>{active && !state.approval_available && state.approval_unavailable_reason && <p className="mt-2 text-sm text-muted-foreground">{state.approval_unavailable_reason}</p>}{!active && <p className="mt-2 text-sm text-muted-foreground">This submission is already finished. You can record your assessment and finish your participation; approval and Request changes are unavailable.</p>}</div>}
      {state.participation.state === "finished" && <p className="mt-4 text-sm text-muted-foreground">Your participation is finished. You can continue non-blocking feedback, but this submission cannot receive another approval or Request changes.</p>}
    </>}
  </section>;
}
