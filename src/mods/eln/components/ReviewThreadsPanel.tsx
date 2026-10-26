import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  addReviewThread, approveReview, assessReview, changeReviewThread, finishReview, getReviewState, getReviewThreads, reopenReview,
  replyReviewThread, startReviewParticipation,
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

export default function ReviewThreadsPanel({ displayId, reviewState, editor, onReviewStateChanged }: {
  displayId: string; reviewState: ReviewState | null; editor: Editor | null;
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
  if (!reviewState?.submissions?.length) return null;
  return <section aria-label="Submission review feedback" className="mx-auto my-6 w-full max-w-4xl border-t border-border px-6 py-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Review feedback</h2><p className="text-sm text-muted-foreground">Stored participation and comments for {reviewable ? "the current submission" : "the latest submission"}.</p></div>
      {active && !state.participation && <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" disabled={busy} onClick={start}>Start review</button>}
      {state.participation && <span className="rounded bg-muted px-2 py-1 text-sm">{state.participation.state.replaceAll("_", " ")}</span>}
      {state.can_reopen && <button type="button" className="rounded border border-border px-3 py-2 text-sm" disabled={busy} onClick={reopen}>Reopen finished work</button>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {state.approval_available === false && state.approval_unavailable_reason && <p role="status" data-approval-category={state.approval_unavailable_category || "readiness"} className="my-3 text-sm text-muted-foreground"><strong>{state.approval_unavailable_category === "access" ? "Review access required." : state.approval_unavailable_category === "attribution" ? "Contributor history." : state.approval_unavailable_category === "exclusion" ? "Witness eligibility." : state.approval_unavailable_category === "blockers" ? "Blocking feedback." : "Approval readiness."}</strong> {state.approval_unavailable_reason}</p>}
    {state.approval && <div className="my-4 rounded border border-border p-3" role="status"><p className="font-medium">Approved by {name(state.approval.witness)} · {new Date(state.approval.approved_at).toLocaleString()}</p><p className="mt-1 text-sm">{state.approval.assessment}</p></div>}
    {reviewable && state.participation && <>
      <div className="my-4 space-y-2 rounded border border-border p-3">
        <label className="block text-sm font-medium" htmlFor="review-feedback-draft">Add feedback</label>
        <textarea id="review-feedback-draft" className="min-h-16 w-full rounded border border-input bg-background p-2 text-sm" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe the requested change or concern" />
        {!editor?.state.selection.empty && <label className="block text-sm">Suggested replacement<textarea aria-label="Suggested replacement" className="mt-1 min-h-12 w-full rounded border border-input bg-background p-2 text-sm" maxLength={5000} value={replacementDraft} onChange={(event) => setReplacementDraft(event.target.value)} placeholder="Optional; replaces only the selected text" /></label>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded border border-border px-3 py-1.5 text-sm" disabled={busy || !draft.trim() || !editor || !editor.state.selection.empty} onClick={() => comment("document")}>Comment on document</button>
          <button type="button" className="rounded border border-border px-3 py-1.5 text-sm" disabled={busy || !draft.trim() || !editor || editor.state.selection.empty} onClick={() => comment("text")}>Comment on selected text</button>
          <button type="button" className="rounded border border-border px-3 py-1.5 text-sm" disabled={busy || !draft.trim() || !replacementDraft.trim() || !editor || editor.state.selection.empty} onClick={() => comment("text", true)}>Suggest replacement</button>
        </div>
      </div>
      <div className="space-y-3">{state.threads.map((thread) => <article key={thread.id} className="rounded border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{name(thread.requester)} · {thread.state}</span>{thread.blocking && <span className="rounded bg-destructive/10 px-2 py-0.5 text-destructive">Blocks review</span>}</div>
        <p className="mt-1 text-xs text-muted-foreground">Original submission {thread.original_submission_id.slice(0, 8)} · {String(thread.anchor.kind)}{typeof thread.anchor.text === "string" && thread.anchor.text ? `: “${thread.anchor.text}”` : ""}</p>
        {thread.anchor.kind === "text" && thread.anchor.submission_id === submissionId && editor && typeof thread.anchor.from === "number" && typeof thread.anchor.to === "number" && <button type="button" className="mt-1 text-xs text-primary underline" onClick={() => editor.chain().focus().setTextSelection({ from: thread.anchor.from as number, to: thread.anchor.to as number }).scrollIntoView().run()}>Show selected text</button>}
        <div className="mt-3 space-y-2">{thread.messages.map((message) => <p key={message.id} className="border-l-2 border-border pl-3 text-sm"><strong>{name(message.author)}:</strong> {message.retracted ? "Message retracted" : message.body}</p>)}</div>
        {thread.can_address && <button type="button" className="mt-2 text-xs text-primary underline" disabled={busy} onClick={() => void run(() => changeReviewThread(displayId, thread.id, "address"))}>Mark Addressed</button>}
        {thread.can_resolve && <div className="mt-2 flex gap-3"><button type="button" className="text-xs text-primary underline" disabled={busy} onClick={() => void run(() => changeReviewThread(displayId, thread.id, "resolve"))}>Resolve request</button><button type="button" className="text-xs text-muted-foreground underline" disabled={busy} onClick={() => void run(() => changeReviewThread(displayId, thread.id, "withdraw"))}>Withdraw request</button></div>}
        {reviewable && (thread.state === "open" || thread.state === "addressed") && <div className="mt-3 flex gap-2"><textarea aria-label="Reply to review feedback" className="min-h-9 flex-1 rounded border border-input bg-background p-2 text-sm" value={replyDrafts[thread.id] ?? ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [thread.id]: event.target.value }))} /><button type="button" className="self-end rounded border border-border px-3 py-2 text-sm" disabled={busy || !(replyDrafts[thread.id] ?? "").trim()} onClick={() => reply(thread)}>Reply</button></div>}
      </article>)}</div>
      {state.participation.state !== "finished" && <div className="mt-4 rounded border border-border p-3"><label htmlFor="review-assessment" className="text-sm font-medium">Final assessment</label><textarea id="review-assessment" className="mt-2 min-h-16 w-full rounded border border-input bg-background p-2 text-sm" value={assessment} onChange={(event) => setAssessment(event.target.value)} /><div className="mt-2 flex flex-wrap gap-2">{active ? <>{state.threads.some((thread) => thread.requester_is_actor && thread.blocking) && <button type="button" className="rounded border border-border px-3 py-2 text-sm" disabled={busy || !assessment.trim()} onClick={() => void run(() => assessReview(displayId, assessment))}>Request changes</button>}<button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" disabled={busy || !assessment.trim() || !state.approval_available} title={state.approval_unavailable_reason || "Approve and finish this target"} onClick={approve}>Approve and finish target</button></> : <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" disabled={busy || !assessment.trim()} onClick={() => void run(async () => { await finishReview(displayId, assessment); setAssessment(""); })}>Finish review</button>}</div>{active && !state.approval_available && state.approval_unavailable_reason && <p className="mt-2 text-sm text-muted-foreground">{state.approval_unavailable_reason}</p>}{!active && <p className="mt-2 text-sm text-muted-foreground">This submission is already finished. You can record your assessment and finish your participation; approval and Request changes are unavailable.</p>}</div>}
      {state.participation.state === "finished" && <p className="mt-4 text-sm text-muted-foreground">Your participation is finished. You can continue non-blocking feedback, but this submission cannot receive another approval or Request changes.</p>}
    </>}
  </section>;
}
