import { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Select } from "../../../shell/src/shared/primitives/Input";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import {
  fetchOutgoingShares,
  createFolderShare,
  patchFolderShareLevel,
  deleteFolderShare,
  fetchProjects,
} from "../../access/api";
import type { FolderShare, Project } from "../../access/types";

interface SharingPanelProps {
  folderId: number;
  projectId: number;
  onMutated: () => void;
}

export function SharingPanel({ folderId, projectId, onMutated }: SharingPanelProps) {
  const [shares, setShares] = useState<FolderShare[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newProjectId, setNewProjectId] = useState<string>("");
  const [newLevel, setNewLevel] = useState<string>("read");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sharesData, projectsData] = await Promise.all([
        fetchOutgoingShares(folderId),
        fetchProjects(),
      ]);
      setShares(sharesData);
      setProjects(projectsData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load shares");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sharedTargetIds = useMemo(
    () => new Set(shares.map((s) => s.target_project)),
    [shares],
  );

  const availableProjects = useMemo(
    () =>
      projects.filter(
        (p) => p.id !== projectId && !sharedTargetIds.has(p.id),
      ),
    [projects, projectId, sharedTargetIds],
  );

  const handleLevelChange = useCallback(
    async (shareId: number, level: string) => {
      setError(null);
      try {
        await patchFolderShareLevel(shareId, level);
        setShares((prev) =>
          prev.map((s) => (s.id === shareId ? { ...s, level: level as FolderShare["level"] } : s)),
        );
        onMutated();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to update share level");
      }
    },
    [onMutated],
  );

  const handleRevoke = useCallback(
    async (shareId: number, targetName: string) => {
      if (!window.confirm(`Revoke share to "${targetName}"?`)) return;
      setError(null);
      try {
        await deleteFolderShare(shareId);
        setShares((prev) => prev.filter((s) => s.id !== shareId));
        onMutated();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to revoke share");
      }
    },
    [onMutated],
  );

  const handleAdd = useCallback(async () => {
    const pid = Number(newProjectId);
    if (!pid) return;
    setAddError(null);
    setAdding(true);
    try {
      const share = await createFolderShare(pid, {
        source_folder: folderId,
        level: newLevel,
      });
      setShares((prev) => [...prev, share]);
      setNewProjectId("");
      setNewLevel("read");
      onMutated();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to add share");
    } finally {
      setAdding(false);
    }
  }, [newProjectId, newLevel, folderId, onMutated]);

  return (
    <div className="space-y-3 border-t border-[var(--color-ink-border)] pt-4 mt-4">
      <h3 className="text-sm font-semibold text-[var(--color-ink)]">Sharing</h3>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {loading && (
        <p className="text-xs text-[var(--color-ink-muted-foreground)]">Loading shares...</p>
      )}

      {!loading && shares.length === 0 && (
        <p className="text-xs text-[var(--color-ink-muted-foreground)]">
          Not shared with any project.
        </p>
      )}

      {shares.map((share) => (
        <div
          key={share.id}
          className="flex items-center gap-2"
          data-testid="share-row"
        >
          <IconBadge
            iconKey="folder"
            colorKey="warn"
            size="sm"
          />
          <span className="text-sm flex-1 min-w-0 truncate">
            {share.target_project_name}
          </span>
          <Select
            className="h-7 w-28 text-xs"
            value={share.level}
            onChange={(e) => handleLevelChange(share.id, e.target.value)}
            data-testid="share-level-select"
          >
            <option value="read">Read</option>
            <option value="read_write">Read + Write</option>
          </Select>
          <IconButton
            aria-label={`Revoke share to ${share.target_project_name}`}
            onClick={() => handleRevoke(share.id, share.target_project_name)}
            data-testid="revoke-share-button"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-ink-border)]">
        <Select
          className="h-7 flex-1 text-xs"
          value={newProjectId}
          onChange={(e) => {
            setNewProjectId(e.target.value);
            setAddError(null);
          }}
          disabled={adding}
          data-testid="add-share-project-select"
        >
          <option value="">Select project...</option>
          {availableProjects.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          className="h-7 w-28 text-xs"
          value={newLevel}
          onChange={(e) => setNewLevel(e.target.value)}
          disabled={adding}
          data-testid="add-share-level-select"
        >
          <option value="read">Read</option>
          <option value="read_write">Read + Write</option>
        </Select>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={adding || !newProjectId}
          data-testid="add-share-button"
        >
          Add
        </Button>
      </div>

      {addError && (
        <p className="text-xs text-red-500" data-testid="add-share-error">
          {addError}
        </p>
      )}
    </div>
  );
}
