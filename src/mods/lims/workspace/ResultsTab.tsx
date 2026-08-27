import { useEffect, useState } from "react";
import { get } from "../../../shell/src/api/client";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../shell/src/shared/primitives/Table";
import type { SchemaComponentProps } from "../../../shell/src/mod-system/types";
import type { EntityListItem } from "../types";

interface ResultColumn {
  name: string;
  type: string;
}

interface ResultGroup {
  schema: {
    id: number;
    name: string;
    icon: string;
    color: string;
    columns: ResultColumn[];
  };
  results: Array<{
    display_id: string;
    name: string;
    created_at: string;
    author_username: string;
    properties: Record<string, unknown>;
  }>;
}

export default function ResultsTab({ entity }: SchemaComponentProps) {
  const [groups, setGroups] = useState<ResultGroup[]>([]);
  const displayId = (entity as EntityListItem).display_id;

  useEffect(() => {
    let cancelled = false;
    setGroups([]);
    get<ResultGroup[]>(`/lims/entities/${encodeURIComponent(displayId)}/results/`)
      .then((data) => {
        if (!cancelled) setGroups(data);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [displayId]);

  if (!groups.length) return <p className="text-sm text-muted-foreground">No results recorded for this entity.</p>;

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const columns = group.schema.columns.filter((column) => column.name !== "Entity");
        return (
          <section key={group.schema.id} className="rounded-lg border border-hairline p-5">
            <h2 className="mb-4 flex items-center gap-2 font-medium">
              <IconBadge iconKey={group.schema.icon || "circle"} colorKey={group.schema.color || "muted"} size="sm" />
              {group.schema.name}
            </h2>
            <Table>
                <caption className="sr-only">{group.schema.name} results</caption>
                <TableHead>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHeaderCell key={column.name}>
                        {column.name}
                      </TableHeaderCell>
                    ))}
                  </TableRow>
                </TableHead>
                <tbody>
                  {group.results.map((result) => (
                    <TableRow key={result.display_id}>
                      {columns.map((column) => (
                        <TableCell key={column.name}>
                          {String(result.properties[column.name] ?? "—")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </tbody>
            </Table>
          </section>
        );
      })}
    </div>
  );
}
