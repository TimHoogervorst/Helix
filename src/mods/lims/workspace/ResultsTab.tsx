import { useEffect, useState } from "react";
import { get } from "../../../shell/src/api/client";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import type { SchemaComponentProps } from "../../../shell/src/mod-system/types";
import type { EntityListItem } from "../types";

interface ResultGroup { schema: { id: number; name: string; icon: string; color: string; columns: Array<{ name: string; type: string }> }; results: Array<{ display_id: string; properties: Record<string, unknown> }> }

export default function ResultsTab({ entity }: SchemaComponentProps) {
  const [groups, setGroups] = useState<ResultGroup[]>([]);
  useEffect(() => { get<ResultGroup[]>(`/lims/entities/${(entity as EntityListItem).display_id}/results/`).then(setGroups).catch(() => setGroups([])); }, [entity]);
  if (!groups.length) return <p className="text-sm text-muted-foreground">No results recorded for this entity.</p>;
  return <div className="space-y-6">{groups.map((group) => <section key={group.schema.id} className="rounded-lg border border-hairline p-5"><h2 className="mb-4 flex items-center gap-2 font-medium"><IconBadge iconKey={group.schema.icon || "circle"} colorKey={group.schema.color || "muted"} size="sm" />{group.schema.name}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{group.schema.columns.filter((column) => column.name !== "Entity").map((column) => <th key={column.name} className="border-b border-hairline px-2 py-2">{column.name}</th>)}</tr></thead><tbody>{group.results.map((result) => <tr key={result.display_id}>{group.schema.columns.filter((column) => column.name !== "Entity").map((column) => <td key={column.name} className="border-b border-hairline px-2 py-2">{String(result.properties[column.name] ?? "—")}</td>)}</tr>)}</tbody></table></div></section>)}</div>;
}
