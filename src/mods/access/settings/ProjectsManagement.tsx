import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Check, X, Archive, ArchiveRestore, Users } from "lucide-react";
import { Button } from "../../../shell/src/shared/primitives/Button";
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
  fetchGrants,
  createGrant,
  deleteGrant,
  fetchTeams,
  fetchPeople,
} from "../api";
import type { Grant, Person, Project, Team } from "../types";

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

  const [expandedGrantsId, setExpandedGrantsId] = useState<number | null>(null);
  const [grants, setGrants] = useState<Record<number, Grant[]>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [addingGrantProjectId, setAddingGrantProjectId] = useState<number | null>(null);
  const [grantRole, setGrantRole] = useState<"read" | "edit">("read");
  const [grantUserId, setGrantUserId] = useState<number | null>(null);
  const [grantTeamId, setGrantTeamId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsData, teamsData, peopleData] = await Promise.all([
        fetchProjects(true),
        fetchTeams(),
        fetchPeople(),
      ]);
      setProjects(projectsData);
      setTeams(teamsData);
      setPeople(peopleData);
    } catch {
      setError("Failed to load Projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadGrants = async (projectId: number) => {
    try {
      const projectGrants = await fetchGrants(projectId);
      setGrants((prev) => ({ ...prev, [projectId]: projectGrants }));
    } catch {
      // ignore
    }
  };

  const toggleGrants = async (projectId: number) => {
    if (expandedGrantsId === projectId) {
      setExpandedGrantsId(null);
      return;
    }
    setExpandedGrantsId(projectId);
    await loadGrants(projectId);
  };

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

  const handleAddGrant = async (projectId: number) => {
    if (!grantUserId && !grantTeamId) return;
    setActionError(null);
    try {
      await createGrant(projectId, {
        role: grantRole,
        ...(grantUserId ? { user: grantUserId } : {}),
        ...(grantTeamId ? { team: grantTeamId } : {}),
      });
      setAddingGrantProjectId(null);
      setGrantUserId(null);
      setGrantTeamId(null);
      await loadGrants(projectId);
    } catch {
      setActionError("Failed to add Grant.");
    }
  };

  const handleRemoveGrant = async (projectId: number, grantId: number) => {
    setActionError(null);
    try {
      await deleteGrant(projectId, grantId);
      await loadGrants(projectId);
    } catch {
      setActionError("Failed to remove Grant.");
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

  const peopleNotGranted = (projectId: number) => {
    const projectGrants = grants[projectId] || [];
    return people.filter(
      (p) => !projectGrants.some((g) => g.user === p.user),
    );
  };

  const teamsNotGranted = (projectId: number) => {
    const projectGrants = grants[projectId] || [];
    return teams.filter(
      (t) => !projectGrants.some((g) => g.team === t.id),
    );
  };

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
                      onClick={() => toggleGrants(project.id)}
                      aria-label={`Manage grants for ${project.name}`}
                      title="Manage Grants"
                    >
                      <Users className="h-3.5 w-3.5" aria-hidden="true" />
                      Grants
                    </Button>
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

            {expandedGrantsId === project.id && (
              <div className="mt-3 border-t border-hairline pt-3">
                <h4 className="mb-2 text-sm font-medium text-[var(--color-ink)]">
                  Grants
                </h4>

                {(grants[project.id] || []).length === 0 && !addingGrantProjectId && (
                  <p className="text-xs text-[var(--color-ink-muted-foreground)] mb-2">
                    No Grants assigned yet.
                  </p>
                )}

                {(grants[project.id] || []).map((grant) => (
                  <div
                    key={grant.id}
                    className="flex items-center justify-between rounded bg-[var(--color-panel-subtle)] px-3 py-1.5 mb-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--color-ink)]">
                        {grant.grantee_name}
                      </span>
                      <span className="text-xs text-[var(--color-ink-muted-foreground)]">
                        ({grant.grantee_type})
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        grant.role === "edit"
                          ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                          : "bg-[var(--color-panel)] text-[var(--color-ink)]"
                      }`}>
                        {grant.role === "edit" ? "Edit" : "Read"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveGrant(project.id, grant.id)}
                      aria-label={`Remove grant for ${grant.grantee_name}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}

                {addingGrantProjectId === project.id ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Grant role"
                        className="rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                        value={grantRole}
                        onChange={(e) => setGrantRole(e.target.value as "read" | "edit")}
                      >
                        <option value="read">Read</option>
                        <option value="edit">Edit</option>
                      </select>
                      <select
                        aria-label="Grant to user"
                        className="flex-1 rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                        value={grantUserId ?? ""}
                        onChange={(e) => {
                          setGrantUserId(e.target.value ? Number(e.target.value) : null);
                          setGrantTeamId(null);
                        }}
                      >
                        <option value="">Select a user…</option>
                        {peopleNotGranted(project.id).map((p) => (
                          <option key={p.user} value={p.user}>
                            {p.first_name || p.last_name
                              ? `${p.first_name} ${p.last_name}`.trim()
                              : p.username}{" "}
                            (@{p.username})
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Grant to team"
                        className="flex-1 rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                        value={grantTeamId ?? ""}
                        onChange={(e) => {
                          setGrantTeamId(e.target.value ? Number(e.target.value) : null);
                          setGrantUserId(null);
                        }}
                      >
                        <option value="">Select a team…</option>
                        {teamsNotGranted(project.id).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleAddGrant(project.id)}
                        disabled={!grantUserId && !grantTeamId}
                        aria-label="Add grant"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Add Grant
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAddingGrantProjectId(null);
                          setGrantUserId(null);
                          setGrantTeamId(null);
                        }}
                        aria-label="Cancel add grant"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddingGrantProjectId(project.id)}
                    className="mt-2 text-xs"
                    aria-label={`Add grant to ${project.name}`}
                  >
                    <Plus className="h-3 w-3" />
                    Add Grant
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
