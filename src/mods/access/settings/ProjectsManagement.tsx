import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Check, X, Archive, ArchiveRestore } from "lucide-react";
import { Button } from "../../../shell/src/shared/primitives/Button";
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
} from "../api";
import type { Project } from "../types";

export default function ProjectsManagement() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProjects(true);
      setProjects(data);
    } catch {
      setError("Failed to load Projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setActionError(null);
    try {
      await createProject({ name: newName.trim() });
      setNewName("");
      setCreating(false);
      await load();
    } catch {
      setActionError("Failed to create Project.");
    }
  };

  const handleRename = async (projectId: number) => {
    if (!draftName.trim()) return;
    setActionError(null);
    try {
      await updateProject(projectId, { name: draftName.trim() });
      setEditingId(null);
      await load();
    } catch {
      setActionError("Failed to rename Project.");
    }
  };

  const handleDelete = async (projectId: number) => {
    setActionError(null);
    try {
      await deleteProject(projectId);
      setDeleteConfirmId(null);
      await load();
    } catch {
      setActionError("Failed to delete Project.");
    }
  };

  const handleArchiveToggle = async (project: Project) => {
    setActionError(null);
    try {
      await updateProject(project.id, { is_archived: !project.is_archived });
      await load();
    } catch {
      setActionError("Failed to update Project.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-base text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-base text-muted-foreground">{error}</p>
      </div>
    );
  }

  const visibleProjects = showArchived
    ? projects
    : projects.filter((p) => !p.is_archived);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">
            Projects
          </h2>
          <p className="text-sm text-[var(--color-ink-muted-foreground)]">
            Create and manage Projects. Each Project is an access boundary
            with its own hidden root Folder.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink-muted-foreground)]">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-hairline"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
          {!creating && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreating(true)}
              aria-label="Create a new Project"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Create Project
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-[var(--color-destructive)]">{actionError}</p>
      )}

      {creating && (
        <div className="flex items-center gap-2 rounded-lg border border-hairline bg-panel p-3">
          <input
            aria-label="New Project name"
            className="flex-1 rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            aria-label="Confirm create project"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Create
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setCreating(false); setNewName(""); }}
            aria-label="Cancel create project"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      {visibleProjects.length === 0 && !creating && (
        <p className="text-sm text-[var(--color-ink-muted-foreground)]">
          No Projects have been created yet.
        </p>
      )}

      <div className="space-y-3">
        {visibleProjects.map((project) => (
          <div
            key={project.id}
            className={`rounded-lg border p-4 ${
              project.is_archived
                ? "border-hairline bg-[var(--color-panel-subtle)]"
                : "border-hairline bg-panel"
            }`}
          >
            <div className="flex items-center justify-between">
              {editingId === project.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    aria-label="Rename Project"
                    className="flex-1 rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    autoFocus
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRename(project.id)}
                    aria-label="Confirm rename"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel rename"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ) : deleteConfirmId === project.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <span className="text-sm text-[var(--color-ink)]">
                    Delete <strong>{project.name}</strong>?
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(project.id)}
                    aria-label="Confirm delete"
                  >
                    Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmId(null)}
                    aria-label="Cancel delete"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="cursor-pointer text-sm font-medium text-[var(--color-ink)] hover:text-[var(--color-primary)]"
                      onClick={() => {
                        setEditingId(project.id);
                        setDraftName(project.name);
                      }}
                      title="Click to rename"
                    >
                      {project.name}
                    </span>
                    {project.is_archived && (
                      <span className="shrink-0 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(project.id);
                        setDraftName(project.name);
                      }}
                      aria-label={`Rename ${project.name}`}
                      title="Rename"
                    >
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleArchiveToggle(project)}
                      aria-label={
                        project.is_archived
                          ? `Restore ${project.name}`
                          : `Archive ${project.name}`
                      }
                      title={project.is_archived ? "Restore" : "Archive"}
                    >
                      {project.is_archived ? (
                        <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteConfirmId(project.id)}
                      aria-label={`Delete ${project.name}`}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
