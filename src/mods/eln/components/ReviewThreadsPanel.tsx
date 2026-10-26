import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  addReviewThread, assessReview, changeReviewThread, getReviewThreads,
  replyReviewThread, startReviewParticipation,
  type ReviewState, type ReviewThread, type ReviewThreadsState,
} from "../api";

function name(person: { displayName?: string; username?: string }) {
  return person.displayName || person.username || "Former user";
}

export default function ReviewThreadsPanel({ displayId, reviewState, editor }: {
  displayId: string; reviewState: ReviewState | null; editor: Editor | null;
}) {
  const [state, setState] = useState<ReviewThreadsState>({ participation: null, threads: [] });
  const [draft, setDraft] = useState("");
  const [assessment, setAssessment] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submissionId = reviewState?.current_submission_id;
  const active = reviewState?.state === "submitted" && Boolean(submissionId);
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
  const comment = (kind: "text" | "document") => {
    if (!submissionId || !editor) return;
    const selection = editor.state.selection;
    const text = kind === "text" ? editor.state.doc.textBetween(selection.from, selection.to, "\n") : "";
    const anchor = {
      submission_id: submissionId, group_key: "document",
      revision_id: reviewState?.submissions?.find((item) => item.id === submissionId)?.manifest?.groups?.document?.revision_id,
      kind, from: selection.from, to: selection.to, text,
    };
    void run(async () => { await addReviewThread(displayId, submissionId, anchor, draft); setDraft(""); });
  };
  const reply = (thread: ReviewThread) => void run(async () => {
    await replyReviewThread(displayId, thread.id, replyDrafts[thread.id] ?? "");
    setReplyDrafts((current) => ({ ...current, [thread.id]: "" }));
  });
  if (!reviewState?.submissions?.length) return null;
  return <section aria-label="Submission review feedback" className="mx-auto my-6 w-full max-w-4xl border-t border-border px-6 py-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Review feedback</h2><p className="text-sm text-muted-foreground">Stored participation and comments for {active ? "the active submission" : "the latest submission"}.</p></div>
      {active && !state.participation && <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" disabled={busy} onClick={start}>Start review</button>}
      {state.participation && <span className="rounded bg-muted px-2 py-1 text-sm">{state.participation.state.replaceAll("_", " ")}</span>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {active && state.participation && <>
      <div className="my-4 space-y-2 rounded border border-border p-3">
        <label className="block text-sm font-medium" htmlFor="review-feedback-draft">Add feedback</label>
        <textarea id="review-feedback-draft" className="min-h-16 w-full rounded border border-input bg-background p-2 text-sm" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe the requested change or concern" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded border border-border px-3 py-1.5 text-sm" disabled={busy || !draft.trim() || !editor || !editor.state.selection.empty} onClick={() => comment("document")}>Comment on document</button>
          <button type="button" className="rounded border border-border px-3 py-1.5 text-sm" disabled={busy || !draft.trim() || !editor || editor.state.selection.empty} onClick={() => comment("text")}>Comment on selected text</button>
        </div>
      </div>
      <div className="space-y-3">{state.threads.map((thread) => <article key={thread.id} className="rounded border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{name(thread.requester)} · {thread.state}</span>{thread.blocking && <span className="rounded bg-destructive/10 px-2 py-0.5 text-destructive">Blocks review</span>}</div>
        <p className="mt-1 text-xs text-muted-foreground">Original submission {thread.original_submission_id.slice(0, 8)} · {String(thread.anchor.kind)}{typeof thread.anchor.text === "string" && thread.anchor.text ? `: “${thread.anchor.text}”` : ""}</p>
        {thread.anchor.kind === "text" && thread.anchor.submission_id === submissionId && editor && typeof thread.anchor.from === "number" && typeof thread.anchor.to === "number" && <button type="button" className="mt-1 text-xs text-primary underline" onClick={() => editor.chain().focus().setTextSelection({ from: thread.anchor.from as number, to: thread.anchor.to as number }).scrollIntoView().run()}>Show selected text</button>}
        <div className="mt-3 space-y-2">{thread.messages.map((message) => <p key={message.id} className="border-l-2 border-border pl-3 text-sm"><strong>{name(message.author)}:</strong> {message.retracted ? "Message retracted" : message.body}</p>)}</div>
        {thread.can_address && <button type="button" className="mt-2 text-xs text-primary underline" disabled={busy} onClick={() => void run(() => changeReviewThread(displayId, thread.id, "address"))}>Mark Addressed</button>}
        {thread.can_resolve && <div className="mt-2 flex gap-3"><button type="button" className="text-xs text-primary underline" disabled={busy} onClick={() => void run(() => changeReviewThread(displayId, thread.id, "resolve"))}>Resolve request</button><button type="button" className="text-xs text-muted-foreground underline" disabled={busy} onClick={() => void run(() => changeReviewThread(displayId, thread.id, "withdraw"))}>Withdraw request</button></div>}
        {thread.blocking && <div className="mt-3 flex gap-2"><textarea aria-label="Reply to review feedback" className="min-h-9 flex-1 rounded border border-input bg-background p-2 text-sm" value={replyDrafts[thread.id] ?? ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [thread.id]: event.target.value }))} /><button type="button" className="self-end rounded border border-border px-3 py-2 text-sm" disabled={busy || !(replyDrafts[thread.id] ?? "").trim()} onClick={() => reply(thread)}>Reply</button></div>}
      </article>)}</div>
      {state.participation.state === "under_review" && state.threads.some((thread) => thread.requester_is_actor && thread.blocking) && <div className="mt-4 rounded border border-border p-3"><label htmlFor="review-assessment" className="text-sm font-medium">Final assessment for Request changes</label><textarea id="review-assessment" className="mt-2 min-h-16 w-full rounded border border-input bg-background p-2 text-sm" value={assessment} onChange={(event) => setAssessment(event.target.value)} /><button type="button" className="mt-2 rounded bg-primary px-3 py-2 text-sm text-primary-foreground" disabled={busy || !assessment.trim()} onClick={() => void run(() => assessReview(displayId, assessment))}>Request changes</button></div>}
    </>}
  </section>;
}
