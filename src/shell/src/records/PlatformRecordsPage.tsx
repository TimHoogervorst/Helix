import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  exportPlatformRecord,
  getExactRecordRevision,
  getPlatformRecord,
  listPlatformRecords,
  listRecordActivity,
  listRecordGroupRevisions,
  RecordValueInspector,
  UnavailableRecordCapability,
  type PlatformRecord,
  type RecordExport,
  type RecordActivity,
  type RecordRevision,
} from "../../../mod-api/src/records";
import { Button } from "../shared/primitives/Button";
import { Input } from "../shared/primitives/Input";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    if (status === 403) return "You do not have access to this record or its history.";
    if (status === 404) return "This record or exact Revision is unavailable.";
  }
  return "The Platform record could not be loaded. Try again.";
}

function saveJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PlatformRecordsPage() {
  const { recordId } = useParams<{ recordId?: string }>();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get("group_id");
  const revisionId = searchParams.get("revision_id");
  const [records, setRecords] = useState<PlatformRecord[]>([]);
  const [record, setRecord] = useState<PlatformRecord | null>(null);
  const [revision, setRevision] = useState<RecordRevision | null>(null);
  const [activity, setActivity] = useState<RecordActivity[]>([]);
  const [recordExport, setRecordExport] = useState<RecordExport | null>(null);
  const [definitionError, setDefinitionError] = useState(false);
  const [history, setHistory] = useState<Array<Omit<RecordRevision, "snapshot">>>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listPlatformRecords({ q: search || undefined, page, page_size: 25 });
      setRecords(result.results);
      setCount(result.count);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    if (!recordId) void loadRecords();
  }, [recordId, loadRecords]);

  useEffect(() => {
    if (!recordId) {
      setRecord(null);
      setRevision(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      getPlatformRecord(recordId),
      listRecordActivity(recordId, { page: 1, page_size: 25 }),
    ]).then(async ([current, actions]) => {
      if (!active) return;
      setRecord(current);
      setActivity(actions.results);
      setRecordExport(null);
      setDefinitionError(false);
      const selectedGroup = groupId ?? current.revision?.group_id;
      if (selectedGroup) {
        const revisions = await listRecordGroupRevisions(recordId, selectedGroup, { page: 1, page_size: 100 });
        if (!active) return;
        setHistory(revisions.results);
      } else {
        setHistory([]);
      }
      if (groupId && revisionId) {
        const exact = await getExactRecordRevision(recordId, groupId, revisionId);
        if (active) setRevision(exact);
      } else {
        setRevision(null);
      }
      try {
        const selectedExport = await exportPlatformRecord(recordId, groupId && revisionId ? { groupId, revisionId } : {});
        if (active) setRecordExport(selectedExport);
      } catch {
        if (active) setDefinitionError(true);
      }
    }).catch((reason) => {
      if (active) setError(errorMessage(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [recordId, groupId, revisionId]);

  if (!recordId) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-5 p-6" aria-labelledby="platform-records-title">
        <header><h1 id="platform-records-title" className="text-title font-[var(--font-label)]">Platform Records</h1>
          <p className="text-meta">Current retained records. History does not add duplicate rows to this count.</p></header>
        <label className="block max-w-lg font-[var(--font-label)] text-sm">Search records
          <Input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Name" />
        </label>
        {error && <p role="alert">{error}</p>}
        {loading ? <p role="status">Loading records…</p> : <p>{count} current records</p>}
        <ul className="divide-y divide-[var(--color-ink-border)]">
          {records.map((item) => <li key={item.id} className="py-3">
            <Link className="font-[var(--font-body)] font-medium text-primary underline" to={`/records/${encodeURIComponent(item.id)}`}>{item.name}</Link>
            <span className="ml-2 font-mono text-meta">{item.display_id}</span>
          </li>)}
        </ul>
        <div className="flex items-center gap-3"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
          <span>Page {page}</span><Button variant="ghost" disabled={page * 25 >= count} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
      </main>
    );
  }

  if (error) return <main className="mx-auto max-w-5xl space-y-4 p-6"><Link to="/records" className="text-primary underline">All records</Link><p role="alert">{error}</p></main>;
  if (loading || !record) return <main className="p-6" role="status">Loading retained record…</main>;

  const shownValues = revision?.snapshot.field_values as Record<string, unknown> | undefined;
  const values = shownValues ?? record.field_values;
  const historical = revision !== null;
  const currentGroupId = record.revision?.group_id ?? "";
  const declaredOperations = recordExport?.definitions.filter((item) => item.kind === "action") ?? [];
  const exportSelected = async () => {
    try {
      const result = await exportPlatformRecord(record.id, historical && groupId && revisionId ? { groupId, revisionId } : {});
      saveJson(`${record.display_id}${historical ? `-revision-${revision.sequence}` : ""}.json`, result);
    } catch (reason) { setError(errorMessage(reason)); }
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6" aria-labelledby="record-title">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><Link to="/records" className="text-sm text-primary underline">All records</Link>
        <h1 id="record-title" className="mt-2 text-title font-[var(--font-label)]">{record.name}</h1>
        <p className="font-mono text-meta">{record.display_id}</p></div>
        <Button onClick={() => void exportSelected()}>Export JSON</Button>
      </header>
      {historical && <p className="rounded-md border border-[var(--color-ink-border)] p-3" role="status">
        Historical group snapshot · {revision.group_key} · Revision {revision.sequence} · {revision.id}
      </p>}
      {!historical && <p className="text-sm">Current record state · Revision {record.revision?.sequence ?? "unavailable"}</p>}
      {recordExport?.capabilities.viewer.available === false && <UnavailableRecordCapability capability="Specialized viewer" reason={recordExport.capabilities.viewer.reason ?? "No compatible viewer is active."} />}
      {definitionError && <UnavailableRecordCapability capability="Contract definitions" reason="The retained definition closure is unavailable." />}
      <section aria-labelledby="record-values-title" className="space-y-3">
        <h2 id="record-values-title" className="text-lg font-semibold">{historical ? "Historical values" : "Current values"}</h2>
        {Object.entries(values ?? {}).map(([fieldId, value]) => <article key={fieldId} className="rounded-md border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-4">
          <h3 className="mb-2 font-medium">{fieldId}</h3><RecordValueInspector value={value} definitions={recordExport?.definitions} />
        </article>)}
      </section>
      <section aria-labelledby="record-history-title" className="space-y-3">
        <h2 id="record-history-title" className="text-lg font-semibold">Group history</h2>
        {history.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-ink-hairline)] py-2">
          <span>Revision {item.sequence} · {item.id}</span>
          <Link className="text-primary underline" to={`/records/${encodeURIComponent(record.id)}?group_id=${encodeURIComponent(groupId ?? currentGroupId)}&revision_id=${encodeURIComponent(item.id)}`}>Open exact Revision</Link>
        </div>)}
      </section>
      <section aria-labelledby="record-operations-title" className="space-y-3">
        <h2 id="record-operations-title" className="text-lg font-semibold">Declared operations</h2>
        <p className="text-sm text-muted-foreground">Declarations are retained for inspection; opening this record does not execute provider code.</p>
        {declaredOperations.length === 0 ? <p>No exact Action Contract declarations are linked from this saved content.</p> : declaredOperations.map((item) => {
          const envelope = item.envelope as { description?: string; definition?: { inputs?: unknown; parameters?: unknown; outputs?: unknown } };
          return <article key={`${item.id}@${item.version}`} className="rounded-md border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-3">
            <h3 className="font-medium">{item.id}@{item.version}</h3><p>{envelope.description}</p>
            <pre className="overflow-auto text-xs">{JSON.stringify({ inputs: envelope.definition?.inputs, parameters: envelope.definition?.parameters, outputs: envelope.definition?.outputs }, null, 2)}</pre>
          </article>;
        })}
      </section>
      <section aria-labelledby="record-activity-title" className="space-y-3">
        <h2 id="record-activity-title" className="text-lg font-semibold">Activity</h2>
        {activity.map((item) => <article key={item.id} className="border-b border-[var(--color-ink-hairline)] py-3">
          <p className="font-[var(--font-label)] font-medium">{item.action}</p><time className="text-meta">{item.created_at}</time>
          {item.descriptions.map((description, index) => <p key={`${item.id}.${index}`}>{description}</p>)}
          <p className="text-sm">Participation: {item.subject.roles.join(", ")}</p>
          {[...item.before, ...item.after].map((exact) => <Link key={`${exact.group_id}.${exact.revision_id}`} className="mr-3 text-primary underline" to={`/records/${encodeURIComponent(record.id)}?group_id=${encodeURIComponent(exact.group_id)}&revision_id=${encodeURIComponent(exact.revision_id)}`}>Open exact Revision {exact.revision_id}</Link>)}
        </article>)}
      </section>
    </main>
  );
}
