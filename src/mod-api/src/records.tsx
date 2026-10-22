import type { ReactNode } from "react";
import { get } from "./api";

export interface RecordPage<T> {
  count: number;
  next: number | null;
  previous: number | null;
  page: number;
  page_size: number;
  results: T[];
}

export interface PlatformRecord {
  id: string;
  display_id: string;
  name: string;
  metadata: Record<string, unknown>;
  project_id: number;
  schema_id: number;
  field_values: Record<string, unknown>;
  state_token: string;
  revision: { id: string; group_id: string; sequence: number; content_hash: string } | null;
}

export interface RecordRevision {
  id: string;
  group_id: string;
  group_key: string;
  sequence: number;
  content_hash: string;
  snapshot: Record<string, unknown>;
  created_at: string;
}

export interface RecordActivity {
  id: number;
  action: string;
  action_type: string;
  performed_by: number | null;
  created_at: string;
  descriptions: string[];
  subject: { id: string; roles: string[] };
  before: Array<{ group_id: string; revision_id: string }>;
  after: Array<{ group_id: string; revision_id: string }>;
}

export interface RecordExport {
  formatVersion: 1;
  record: Pick<PlatformRecord, "id" | "display_id" | "name" | "metadata" | "schema_id" | "field_values">;
  state: { group_id: string | null; revision_id: string | null; snapshot: Record<string, unknown> | null };
  definitions: Array<{ kind: string; id: string; version: string; fingerprint: string; envelope: unknown }>;
  attachments: unknown[];
  capabilities: Record<string, { available: boolean; reason?: string }>;
}

export interface RecordQuery {
  page?: number;
  page_size?: number;
  q?: string;
  schema_id?: number;
  project_id?: number;
}

function queryString(query: RecordQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

/** Current Platform records only; retained snapshots never inflate this count. */
export function listPlatformRecords(query: RecordQuery = {}, signal?: AbortSignal) {
  return get<RecordPage<PlatformRecord>>(`/records/${queryString(query)}`, signal);
}

export function getPlatformRecord(recordId: string, signal?: AbortSignal) {
  return get<PlatformRecord>(`/records/${encodeURIComponent(recordId)}/`, signal);
}

export function listRecordGroupRevisions(recordId: string, groupId: string, query: Pick<RecordQuery, "page" | "page_size"> = {}, signal?: AbortSignal) {
  return get<RecordPage<Omit<RecordRevision, "snapshot">>>(
    `/records/${encodeURIComponent(recordId)}/groups/${encodeURIComponent(groupId)}/revisions/${queryString(query)}`,
    signal,
  );
}

export function getExactRecordRevision(recordId: string, groupId: string, revisionId: string, signal?: AbortSignal) {
  return get<RecordRevision>(
    `/records/${encodeURIComponent(recordId)}/groups/${encodeURIComponent(groupId)}/revisions/${encodeURIComponent(revisionId)}/`,
    signal,
  );
}

export function listRecordActivity(recordId: string, query: Pick<RecordQuery, "page" | "page_size"> = {}, signal?: AbortSignal) {
  return get<RecordPage<RecordActivity>>(`/records/${encodeURIComponent(recordId)}/actions/${queryString(query)}`, signal);
}

export function exportPlatformRecord(recordId: string, selection: { groupId?: string; revisionId?: string } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (selection.groupId) params.set("group_id", selection.groupId);
  if (selection.revisionId) params.set("revision_id", selection.revisionId);
  const suffix = params.size ? `?${params}` : "";
  return get<RecordExport>(`/records/${encodeURIComponent(recordId)}/export/${suffix}`, signal);
}

export interface RecordValueInspectorProps {
  value: unknown;
  descriptions?: Readonly<Record<string, string>>;
  definitions?: ReadonlyArray<unknown>;
}

function renderValue(
  value: unknown,
  descriptions: Readonly<Record<string, string>>,
  definitions: ReadonlyArray<unknown>,
  path: string,
  visited: ReadonlySet<string> = new Set(),
): ReactNode {
  if (value === null) return <span>null</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return <ol>{value.map((item, index) => <li key={`${path}.${index}`}>{renderValue(item, descriptions, definitions, `${path}.${index}`, visited)}</li>)}</ol>;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const type = object.type;
    const reference = object.contract && typeof object.contract === "object"
      ? object.contract as Record<string, unknown>
      : type === "contract" ? object : undefined;
    if (reference && typeof reference.id === "string" && typeof reference.version === "string") {
      const key = `${String(reference.kind ?? "data")}:${reference.id}@${reference.version}`;
      const envelope = definitions.map((item) => item as Record<string, unknown>).find((item) =>
        item.id === reference.id && item.version === reference.version && (item.kind ?? "data") === (reference.kind ?? "data"),
      );
      const seen = new Set(visited);
      seen.add(key);
      const exactEnvelope = envelope?.envelope && typeof envelope.envelope === "object"
        ? envelope.envelope as Record<string, unknown>
        : envelope;
      const valueNode = object.value;
      return <section aria-label={`Exact definition ${reference.id}@${reference.version}`}>
        <p>Exact definition · {String(reference.id)}@{String(reference.version)}</p>
        {visited.has(key) ? <p>Recursive exact definition already shown.</p> : exactEnvelope ? <>
          <p>{String(exactEnvelope.description ?? "")}</p>
          <details><summary>Definition</summary>{renderValue(exactEnvelope.definition, descriptions, definitions, `${path}.definition`, seen)}</details>
        </> : <p>Definition unavailable in this export.</p>}
        {valueNode !== undefined && <div><h4>Saved value</h4>{renderValue(valueNode, descriptions, definitions, `${path}.value`, visited)}</div>}
      </section>;
    }
    if (type === "recordReference" || (type === undefined && typeof object.id === "string")) {
      const reference = (type === "recordReference" && object.value && typeof object.value === "object")
        ? object.value as Record<string, unknown>
        : object;
      const targetId = reference.id ?? reference.entity_id ?? reference.record_id;
      const revisionValue = reference.revision_id ?? reference.revisionId ?? reference.revision;
      const revision = revisionValue && typeof revisionValue === "object"
        ? (revisionValue as Record<string, unknown>).id ?? (revisionValue as Record<string, unknown>).revision_id
        : revisionValue;
      const group = reference.group_id ?? reference.groupId ?? (revisionValue && typeof revisionValue === "object"
        ? (revisionValue as Record<string, unknown>).group_id ?? (revisionValue as Record<string, unknown>).groupId
        : undefined);
      if (typeof targetId !== "string") return <span>Unavailable record reference</span>;
      if (revision) {
        if (typeof group !== "string") return <span>Exact Revision reference unavailable · {targetId}</span>;
        const query = new URLSearchParams({ group_id: group, revision_id: String(revision) });
        return <a href={`/records/${encodeURIComponent(targetId)}?${query}`}>Exact record reference · Revision {String(revision)} · {targetId}</a>;
      }
      return <a href={`/records/${encodeURIComponent(targetId)}`}>Current record reference · {targetId}</a>;
    }
    const contract = object.contract as { id?: string; version?: string } | undefined;
    const label = contract?.id && contract.version ? `${contract.id}@${contract.version}` : undefined;
    return <dl>{Object.entries(object).filter(([key]) => key !== "contract").map(([key, child]) => (
      <div key={`${path}.${key}`}><dt>{key}{descriptions[`${path}.${key}`] ? ` — ${descriptions[`${path}.${key}`]}` : ""}</dt>
        <dd>{renderValue(child, descriptions, definitions, `${path}.${key}`, visited)}</dd></div>
    ))}{label && <div><dt>Exact definition</dt><dd>{label}</dd></div>}</dl>;
  }
  return <span>Unavailable value</span>;
}

/** Provider-independent fallback for retained TypedValues and nested payloads. */
export function RecordValueInspector({ value, descriptions = {}, definitions = [] }: RecordValueInspectorProps) {
  return <div className="helix-record-value-inspector">{renderValue(value, descriptions, definitions, "value")}</div>;
}

export function UnavailableRecordCapability({ capability, reason }: { capability: string; reason: string }) {
  return <p role="status">{capability} unavailable. {reason} Retained values remain available for generic inspection.</p>;
}
