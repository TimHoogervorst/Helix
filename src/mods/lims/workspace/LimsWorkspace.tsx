import { useState } from "react";
import type { ReactNode } from "react";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { TabBar } from "../../../shell/src/shared/primitives/TabBar";
import { formatDate } from "../../../shell/src/shared/format";
import type { EntityListItem } from "../types";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="max-w-[65%] text-right text-sm text-foreground">{children || "—"}</dd>
    </div>
  );
}

function Overview({ entity }: { entity: EntityListItem }) {
  const columns = entity.schema_columns ?? [];
  return (
    <div className="space-y-6" data-testid="overview-tab">
      <section className="rounded-lg border border-hairline p-5" data-testid="metadata-block">
        <h2 className="mb-3 font-[var(--font-label)] text-xs uppercase tracking-widest text-muted-foreground">Metadata</h2>
        <dl>
          <Field label="Schema">{entity.schema_name}</Field>
          <Field label="Status">{entity.status}</Field>
          <Field label="Author">{entity.author_username}</Field>
          <Field label="Last editor">{entity.last_editor_username}</Field>
          <Field label="Created">{formatDate(entity.created_at)}</Field>
          <Field label="Updated">{formatDate(entity.updated_at)}</Field>
          <Field label="Source entry">{entity.source_entry_display_id}</Field>
          <Field label="Folder">{entity.folder_path}</Field>
          {columns.map((column) => {
            const type = ModRegistry.getInstance().getColumnType(column.type);
            const value = entity.properties[column.name];
            return (
              <Field key={column.id ?? column.name} label={column.name}>
                <span className="inline-flex items-center gap-1.5">
                  {type && <IconBadge iconKey={type.icon} colorKey={type.color} size="sm" />}
                  {value === null || value === undefined || value === "" ? "—" : String(value)}
                </span>
              </Field>
            );
          })}
        </dl>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-hairline p-5" data-testid="linked-entities-block">
          <h2 className="font-[var(--font-label)] text-xs uppercase tracking-widest text-muted-foreground">Linked entities</h2>
          <p className="mt-4 text-sm text-muted-foreground">No linked entities.</p>
        </section>
        <section className="rounded-lg border border-hairline p-5" data-testid="notebook-references-block">
          <h2 className="font-[var(--font-label)] text-xs uppercase tracking-widest text-muted-foreground">Notebook references</h2>
          <p className="mt-4 text-sm text-muted-foreground">No notebook references.</p>
        </section>
      </div>
    </div>
  );
}

interface LimsWorkspaceProps {
  entity: EntityListItem;
  isExiting: boolean;
}

function LimsWorkspace({ entity }: LimsWorkspaceProps) {
  const components = ModRegistry.getInstance().getSchemaComponents();
  const enabled = new Set(entity.enabled_components ?? []);
  const tabs = [
    { id: "overview", label: "Overview", component: null },
    ...components
      .filter((component) => enabled.has(component.id))
      .map((component) => ({ id: component.id, label: component.label, component })),
  ];
  const [activeTab, setActiveTab] = useState("overview");
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const Component = active.component?.component;

  return (
    <div className="workspace-text-column w-full" data-testid="entity-workspace">
      <TabBar tabs={tabs.map(({ id, label }) => ({ id, label }))} activeTab={active.id} onTabChange={setActiveTab} className="mb-5" />
      {active.id === "overview" ? <Overview entity={entity} /> : Component ? <Component entity={entity} /> : null}
    </div>
  );
}

export default LimsWorkspace;
