import { useCallback, useEffect, useState } from "react";
import { Button, Textarea } from "@helix/mod-api/host";
import {
  amendDiscussionMessage,
  createDiscussion,
  listDiscussions,
  replyToDiscussion,
  resolveDiscussion,
  retractDiscussionMessage,
  type Discussion,
  type DiscussionMessage,
} from "../api";

function displayName(person: { displayName?: string; username?: string }) {
  return person.displayName || person.username || "Former user";
}

function DiscussionMessageRow({
  discussion,
  message,
  onChanged,
}: {
  discussion: Discussion;
  message: DiscussionMessage;
  onChanged: (discussion: Discussion) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await amendDiscussionMessage(discussion.id, message.id, body));
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not amend this message.");
    } finally {
      setBusy(false);
    }
  };

  const retract = async () => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await retractDiscussionMessage(discussion.id, message.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not retract this message.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="border-l-2 border-border pl-3" aria-label="Discussion message">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{displayName(message.author)}</span>
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea className="w-full" aria-label="Amend message" value={body} onChange={(event) => setBody(event.target.value)} />
          <div className="flex gap-2">
            <Button variant="primary" size="md" disabled={busy || !body.trim()} onClick={() => void save()}>Save amendment</Button>
            <Button variant="ghost" size="md" onClick={() => { setEditing(false); setBody(message.body); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className={message.retracted ? "mt-1 text-sm italic text-muted-foreground" : "mt-1 whitespace-pre-wrap text-sm"}>
          {message.retracted ? "Message retracted" : message.body}
        </p>
      )}
      {message.history.length > 1 && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Amendment history ({message.history.length - 1})</summary>
          <ol className="mt-1 space-y-1">
            {message.history.map((revision, index) => (
              <li key={`${message.id}-${index}`}>
                {revision.action === "create" ? "Original" : revision.action === "amend" ? "Amended" : "Retracted"} by {displayName(revision.actor)} · {new Date(revision.created_at).toLocaleString()}
                {revision.action !== "retract" && <blockquote className="mt-1 border-l border-border pl-2">{revision.body}</blockquote>}
              </li>
            ))}
          </ol>
        </details>
      )}
      {message.can_change && !editing && !message.retracted && (
        <div className="mt-1 flex gap-3 text-xs">
          <Button variant="ghost" size="md" disabled={busy} onClick={() => setEditing(true)}>Amend</Button>
          <Button variant="destructive" size="md" disabled={busy} onClick={() => void retract()}>Retract</Button>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </article>
  );
}

export default function DiscussionPanel({ recordId }: { recordId: string }) {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [canContribute, setCanContribute] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listDiscussions(recordId);
      setDiscussions(result.results);
      setCanContribute(result.can_contribute);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discussions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const submit = async (discussionId?: string) => {
    const text = discussionId ? replyDrafts[discussionId] ?? "" : draft;
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = discussionId
        ? await replyToDiscussion(discussionId, text)
        : await createDiscussion(recordId, text);
      setDiscussions((current) => discussionId
        ? current.map((item) => item.id === updated.id ? updated : item)
        : [updated, ...current]);
      if (discussionId) setReplyDrafts((current) => ({ ...current, [discussionId]: "" }));
      else setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your discussion could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await resolveDiscussion(id);
      setDiscussions((current) => current.map((item) => item.id === id ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This discussion could not be resolved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="authoring-discussions-title" className="mx-auto mt-8 w-full max-w-4xl border-t border-border px-6 py-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 id="authoring-discussions-title" className="text-lg font-semibold">Authoring discussions</h2>
          <p className="text-sm text-muted-foreground">These conversations do not change the document or block review completion.</p>
        </div>
        <Button variant="ghost" size="md" onClick={() => void refresh()}>Refresh</Button>
      </div>
      {error && <p role="alert" className="mb-3 rounded border border-destructive/40 p-2 text-sm text-destructive">{error}</p>}
      {loading ? <p className="text-sm text-muted-foreground">Loading discussions…</p> : (
        <div className="space-y-4">
          {discussions.length === 0 && <p className="text-sm text-muted-foreground">No discussions yet.</p>}
          {discussions.map((discussion) => {
            const root = discussion.messages.find((message) => !message.parent_id);
            const replies = discussion.messages.filter((message) => message.parent_id);
            return (
              <article key={discussion.id} className="rounded-md border border-border bg-card p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    Started by {displayName(discussion.created_by)} · {new Date(discussion.created_at).toLocaleString()}
                    {discussion.resolved && <span className="ml-2 rounded bg-muted px-2 py-0.5 text-foreground">Resolved by {displayName(discussion.resolved_by)} · {discussion.resolved_at ? new Date(discussion.resolved_at).toLocaleString() : ""}</span>}
                  </div>
                  {discussion.can_resolve && !discussion.resolved && <Button variant="ghost" size="sm" className="shrink-0" disabled={busy} onClick={() => void resolve(discussion.id)}>Resolve</Button>}
                </div>
                <div className="space-y-3">
                  {root && <DiscussionMessageRow discussion={discussion} message={root} onChanged={(updated) => setDiscussions((items) => items.map((item) => item.id === updated.id ? updated : item))} />}
                  {replies.map((message) => <div key={message.id} className="ml-5"><DiscussionMessageRow discussion={discussion} message={message} onChanged={(updated) => setDiscussions((items) => items.map((item) => item.id === updated.id ? updated : item))} /></div>)}
                </div>
                {discussion.can_contribute && (
                  <div className="mt-3 flex gap-2">
                    <Textarea className="min-h-9 flex-1" aria-label="Reply to discussion" value={replyDrafts[discussion.id] ?? ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [discussion.id]: event.target.value }))} placeholder="Write a reply…" />
                    <Button variant="primary" size="md" className="self-end" disabled={busy || !(replyDrafts[discussion.id] ?? "").trim()} onClick={() => void submit(discussion.id)}>Reply</Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {canContribute && <div className="mt-5 rounded-md border border-border p-3">
        <label htmlFor="new-authoring-discussion" className="mb-2 block text-sm font-medium">Start a discussion</label>
        <Textarea className="min-h-20 w-full" id="new-authoring-discussion" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Share a note or question…" />
        <Button variant="primary" size="md" className="mt-2" disabled={busy || !draft.trim()} onClick={() => void submit()}>Post discussion</Button>
      </div>}
    </section>
  );
}
