import { useEffect, useState } from "react";
import { Check, ChevronRight, Download, Folder, Share2, Star, Copy } from "lucide-react";
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
import type { EntityListItem } from "../types";
import LimsWorkspace from "./LimsWorkspace";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(value).then(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }).catch(() => undefined);
  return (
    <button type="button" onClick={copy} aria-label={copied ? "Copied!" : label}
      className="inline-flex items-center gap-1 rounded-md border border-hairline px-2 py-1 font-[var(--font-label)] text-xs text-muted-foreground hover:text-foreground">
      {value} {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
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

  const folders = pathSegments(entity.folder_path);
  const libraryRoot = entity.project_uid ? `/library?project=${encodeURIComponent(entity.project_uid)}` : "/library";
  const share = () => navigator.clipboard.writeText(`${window.location.origin}/lims/${entity.display_id}`).then(() => {
    setShared(true); window.setTimeout(() => setShared(false), 2000);
  }).catch(() => undefined);

  return (
    <div className="flex min-w-0 flex-1 items-start gap-8 p-6">
      <main className="min-w-0 flex-1">
        <div className="mb-6 flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Folder className="h-4 w-4" aria-hidden="true" />
            {folders.length ? folders.map((folder, index) => {
              const last = index === folders.length - 1;
              return <span key={folder} className="flex items-center gap-1.5">{last ? <span>{folder}</span> : <Link to={`${libraryRoot}&path=${encodeURIComponent(segmentPath(folders, index))}`}>{folder}</Link>}<ChevronRight className="h-3 w-3" /></span>;
            }) : null}
            {!folders.length && <span className="font-medium text-foreground">{entity.display_id}</span>}
          </div>
          <div className="flex items-center gap-1">
            <IconButton aria-label="Star" title="Star"><Star className="h-4 w-4" /></IconButton>
            <IconButton aria-label="Export" title="Export"><Download className="h-4 w-4" /></IconButton>
            <IconButton variant="primary" aria-label={shared ? "Copied!" : "Share"} title="Copy link" onClick={share}>{shared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}</IconButton>
          </div>
        </div>

        <div className="workspace-text-column">
          <header className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <IconBadge iconKey={entity.schema_icon || "circle"} colorKey={entity.schema_color || "muted"} size="lg" />
              <h1 className="text-4xl font-semibold tracking-tight text-foreground">{entity.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={entity.status === "finished" ? "success" : "neutral"}>{entity.status === "in_progress" ? "In Progress" : entity.status === "finished" ? "Finished" : entity.status}</Badge>
              <CopyButton value={entity.display_id} label="Copy display ID" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground" data-testid="entity-meta-line">
              {entity.author_username || "Unknown author"} · {entity.folder_path || "No folder"} · Updated {new Date(entity.updated_at).toLocaleDateString()}
            </p>
            <TagSection tags={taggableItems.tags} onAddTag={entity.effective_role === "edit" ? taggableItems.addTag : undefined} onRemoveTag={entity.effective_role === "edit" ? taggableItems.removeTag : undefined} />
          </header>
          <LimsWorkspace entity={entity} isExiting={false} />
        </div>
      </main>
      <aside className="hidden w-80 shrink-0 xl:block" data-testid="activity-panel">
        <h2 className="mb-3 font-[var(--font-label)] text-xs uppercase tracking-widest text-muted-foreground">Activity</h2>
        <ActivityFeedBlock context={{ workspaceId: "lims", user: null, viewMode: "view", entityId: String(entity.id), displayId: entity.display_id }} instance={{ id: "lims.activity", blockId: "lims.activity-feed", slotId: "lims.entity-workspace", attrs: {}, updateAttrs: () => undefined }} overrides={{}} />
      </aside>
    </div>
  );
}

export default LimsWorkspacePage;
