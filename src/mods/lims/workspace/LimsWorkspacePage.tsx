import { useEffect, useState } from "react";
import { Check, ChevronRight, Download, Folder, Share2, Star, Copy, History } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { get, isNotFoundError } from "../../../shell/src/api/client";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { Badge } from "../../../shell/src/shared/primitives/Badge";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import NotFound from "../../../shell/src/shared/components/NotFound";
import { pathSegments, segmentPath } from "../../library/path";
import { TagSection } from "../../tags/ui";
import { useTaggableItems } from "../../tags/hooks";
import { attachEntityTags, detachEntityTag } from "../hub/api";
import { ActivityFeedBlock } from "../blocks/ActivityFeedBlock";
import { CollapsibleSidebar } from "../../../shell/src/shared/components/Sidebar/CollapsibleSidebar";
import { SidebarSection } from "../../../shell/src/shared/components/Sidebar/SidebarSection";
import { SidebarProvider } from "../../../shell/src/workspace/SidebarContext";
import type { EntityListItem, SourcePathSegment } from "../types";
import LimsWorkspace from "./LimsWorkspace";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(value).then(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }).catch(() => undefined);
  return (
    <button type="button" onClick={copy} aria-label={copied ? "Copied!" : label}
      className="inline-flex items-center gap-1 rounded-md border border-hairline bg-background px-1.5 py-0.5 font-[var(--font-label)] text-2xs text-foreground hover:border-foreground/30">
      {value} {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function EntityActivitySidebar({ entity }: { entity: EntityListItem }) {
  return (
    <SidebarProvider>
      <CollapsibleSidebar side="right" variant="full-hide">
        <SidebarSection id="activity" label="Activity" icon={History}>
          <ActivityFeedBlock
            context={{ workspaceId: "lims", user: null, viewMode: "view", entityId: String(entity.id), displayId: entity.display_id }}
            instance={{ id: "lims.activity", blockId: "lims.activity-feed", slotId: "lims.entity-workspace", attrs: {}, updateAttrs: () => undefined }}
            overrides={{}}
          />
        </SidebarSection>
      </CollapsibleSidebar>
    </SidebarProvider>
  );
}

function statusLabel(status: string): string {
  return status.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function LimsWorkspacePage() {
  const { displayId } = useParams<{ displayId: string }>();
  const navigate = useNavigate();
  const [entity, setEntity] = useState<EntityListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [shared, setShared] = useState(false);
  const taggableItems = useTaggableItems({
    initialTags: entity?.tags ?? [],
    attachFn: displayId ? async (ids) => setEntity(await attachEntityTags(displayId, ids)) : undefined,
    detachFn: displayId ? async (id) => setEntity(await detachEntityTag(displayId, id)) : undefined,
  });

  useEffect(() => {
    if (!displayId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    get<EntityListItem>(`/lims/entities/${encodeURIComponent(displayId)}/`)
      .then((data) => { if (!cancelled) setEntity(data); })
      .catch((err) => { if (!cancelled) { setError(err instanceof Error ? err.message : "Failed to load entity"); setNotFound(isNotFoundError(err)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [displayId]);

  if (loading) return <div className="page"><p className="empty">Loading…</p></div>;
  if (notFound) return <NotFound />;
  if (error || !entity) return <div className="page"><div className="error">{error || "Entity not found."}</div><button className="btn" onClick={() => navigate("/lims")}>Back to LIMS</button></div>;

  const sourceSegments: SourcePathSegment[] = entity.source_path ?? [];
  const projectSegment = sourceSegments.find((segment) => segment.kind === "project");
  const projectUid = projectSegment?.uid || entity.project_uid;
  const libraryRoot = projectUid ? `/library?project=${encodeURIComponent(projectUid)}` : "/library";
  const folders = pathSegments(entity.folder_path);
  const share = () => navigator.clipboard.writeText(`${window.location.origin}/lims/${entity.display_id}`).then(() => {
    setShared(true); window.setTimeout(() => setShared(false), 2000);
  }).catch(() => undefined);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-hairline px-6 py-2">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Folder className="h-4 w-4" aria-hidden="true" />
            {sourceSegments.length ? sourceSegments.map((segment, index) => {
              const folderNames = sourceSegments.slice(0, index + 1)
                .filter((item) => item.kind === "folder")
                .map((item) => item.name);
              let to = libraryRoot;
              if (segment.kind === "folder") {
                to = `${libraryRoot}&path=${encodeURIComponent(`/${folderNames.join("/")}`)}`;
              } else if (segment.kind === "entry") {
                to = `/eln/${segment.display_id}`;
              } else if (segment.kind === "entity") {
                to = `/lims/${segment.display_id}`;
              }
              return <span key={`${segment.kind}-${segment.id}`} className="flex items-center gap-1.5"><Link to={to}>{segment.name}</Link><ChevronRight className="h-3 w-3" /></span>;
            }) : folders.length ? folders.map((folder, index) => {
              const last = index === folders.length - 1;
              return <span key={folder} className="flex items-center gap-1.5">{last ? <span>{folder}</span> : <Link to={`${libraryRoot}&path=${encodeURIComponent(segmentPath(folders, index))}`}>{folder}</Link>}<ChevronRight className="h-3 w-3" /></span>;
            }) : null}
            <span className="font-medium text-foreground">{entity.display_id}</span>
          </div>
          <div className="flex items-center gap-1">
            <IconButton aria-label="Star" title="Star"><Star className="h-4 w-4" /></IconButton>
            <IconButton aria-label="Export" title="Export"><Download className="h-4 w-4" /></IconButton>
            <IconButton variant="primary" aria-label={shared ? "Copied!" : "Share"} title="Copy link" onClick={share}>{shared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}</IconButton>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-y-auto" style={{ overflowX: "clip" }}>
          <main className="min-h-0 w-full px-6 pb-24 pt-5">
            <div className="workspace-text-column">
              <header className="mb-2">
                <div className="flex items-start gap-2">
                  <IconBadge iconKey={entity.schema_icon || "circle"} colorKey={entity.schema_color || "muted"} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">{entity.name}</h1>
                      <Badge variant={entity.status === "released" || entity.status === "finished" ? "success" : "neutral"}>{statusLabel(entity.status)}</Badge>
                    </div>
                    <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground" data-testid="entity-meta-line">
                      <CopyButton value={entity.display_id} label="Copy display ID" />
                      <span>{entity.author_username || "Unknown author"}</span>
                      <span>{entity.folder_path || "No folder"}</span>
                      <span>Modified {new Date(entity.updated_at).toLocaleString()}</span>
                    </div>
                    <div className="-mt-2">
                      <TagSection tags={taggableItems.tags} onAddTag={entity.effective_role === "edit" ? taggableItems.addTag : undefined} onRemoveTag={entity.effective_role === "edit" ? taggableItems.removeTag : undefined} />
                    </div>
                  </div>
                </div>
              </header>
              <LimsWorkspace entity={entity} isExiting={false} />
            </div>
          </main>
        </div>
      </div>
      <div data-testid="activity-panel">
        <EntityActivitySidebar entity={entity} />
      </div>
    </div>
  );
}

export default LimsWorkspacePage;
