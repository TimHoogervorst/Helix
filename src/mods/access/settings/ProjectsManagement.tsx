import { useState, useEffect, useCallback } from "react";
import {
  FolderKanban,
  Trash2,
  X,
  Check,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { Input } from "../../../shell/src/shared/primitives/Input";
import { SettingsPageLayout } from "../../../shell/src/shared/components/SettingsPageLayout";
import { SettingsHeroHeader } from "../../../shell/src/shared/components/SettingsHeroHeader";
import { SettingsSectionCard } from "../../../shell/src/shared/components/SettingsSectionCard";
import {
  SettingsMasterList,
  type MasterListRow,
} from "../../../shell/src/shared/components/SettingsMasterList";
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [filterValue, setFilterValue] = useState("");

  const [grants, setGrants] = useState<Record<number, Grant[]>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [addingGrant, setAddingGrant] = useState(false);
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

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createProject({ name: newName.trim() });
      setNewName("");
      setShowNew(false);
      await load();
    } catch {
      setError("Failed to create Project.");
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (id: string | number) => {
    const projectId = Number(id);
    if (projectId === selectedId) {
      setSelectedId(null);
    } else {
      setSelectedId(projectId);
      const project = projects.find((p) => p.id === projectId);
      if (project) setNameDraft(project.name);
      loadGrants(projectId);
    }
    setAddingGrant(false);
    setGrantUserId(null);
    setGrantTeamId(null);
    setDeleteConfirmId(null);
  };

  const handleRename = async (projectId: number) => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      const project = projects.find((p) => p.id === projectId);
      if (project) setNameDraft(project.name);
      return;
    }
    setError(null);
    try {
      await updateProject(projectId, { name: trimmed });
      await load();
    } catch {
      setError("Failed to rename Project.");
    }
  };

  const handleDelete = async (projectId: number) => {
    setError(null);
    try {
      await deleteProject(projectId);
      setDeleteConfirmId(null);
      if (selectedId === projectId) setSelectedId(null);
      await load();
    } catch {
      setError("Failed to delete Project.");
    }
  };

  const handleArchiveToggle = async (project: Project) => {
    setError(null);
    try {
      await updateProject(project.id, { is_archived: !project.is_archived });
      if (!project.is_archived) {
        // Project is being archived — deselect if selected
        if (selectedId === project.id) setSelectedId(null);
      }
      await load();
    } catch {
      setError("Failed to update Project.");
    }
  };

  const handleAddGrant = async (projectId: number) => {
    if (!grantUserId && !grantTeamId) return;
    setError(null);
    try {
      await createGrant(projectId, {
        role: grantRole,
        ...(grantUserId ? { user: grantUserId } : {}),
        ...(grantTeamId ? { team: grantTeamId } : {}),
      });
      setAddingGrant(false);
      setGrantUserId(null);
      setGrantTeamId(null);
      await loadGrants(projectId);
    } catch {
      setError("Failed to add Grant.");
    }
  };

  const handleRemoveGrant = async (projectId: number, grantId: number) => {
    setError(null);
    try {
      await deleteGrant(projectId, grantId);
      await loadGrants(projectId);
    } catch {
      setError("Failed to remove Grant.");
    }
  };

  const visibleProjects = showArchived
    ? projects
    : projects.filter((p) => !p.is_archived);

  const filteredProjects = filterValue
    ? visibleProjects.filter((p) =>
        p.name.toLowerCase().includes(filterValue.toLowerCase()),
      )
    : visibleProjects;

  const masterRows: MasterListRow[] = filteredProjects.map((p) => ({
    id: p.id,
    label: p.name,
    secondary: p.is_archived ? "Archived" : undefined,
    icon: <FolderKanban size={13} />,
  }));

  const selectedProject = selectedId
    ? projects.find((p) => p.id === selectedId) ?? null
    : null;

  const projectGrants = selectedId ? grants[selectedId] ?? [] : [];

  const peopleNotGranted = (projectId: number) => {
    const pg = grants[projectId] || [];
    return people.filter((p) => !pg.some((g) => g.user === p.user));
  };

  const teamsNotGranted = (projectId: number) => {
    const pg = grants[projectId] || [];
    return teams.filter((t) => !pg.some((g) => g.team === t.id));
  };

  if (loading) return <p className="empty">Loading…</p>;

  return (
    <SettingsPageLayout
      hero={
        <>
          <SettingsHeroHeader
            eyebrow="access control"
            title="Projects"
            description="Create and manage Projects. Each Project is an access boundary with its own hidden root Folder."
            actions={
              <Button size="sm" onClick={() => setShowNew(!showNew)}>
                {showNew ? "Cancel" : "+ New Project"}
              </Button>
            }
          />

          {showNew && (
            <div className="mb-6 rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-4">
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-ink-muted-foreground)]">
                    Name
                  </span>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Project name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={saving || !newName.trim()}
                  >
                    {saving ? "Creating…" : "Create"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNew(false);
                      setNewName("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-2.5 text-sm text-[var(--color-warning)]">
          {error}
        </div>
      )}

      <div className="flex min-h-0 gap-0">
        <div className="w-64 shrink-0">
          <SettingsMasterList
            rows={masterRows}
            selectedId={selectedId}
            filterValue={filterValue}
            onFilterChange={setFilterValue}
            onSelect={handleSelect}
            filterPlaceholder="Filter projects"
            actions={
              <button
                type="button"
                className={`rounded border-transparent bg-transparent px-1.5 py-0.5 font-[var(--font-label)] text-2xs uppercase tracking-wider transition-colors ${
                  showArchived
                    ? "font-medium text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-ink)]"
                }`}
                onClick={() => setShowArchived(!showArchived)}
                title={showArchived ? "Hide archived" : "Show archived"}
              >
                {showArchived ? "Active" : "All"}
              </button>
            }
          />
          {masterRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--color-ink-muted-foreground)]">
              No projects found.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-4 p-6">
          {selectedProject ? (
            <>
              <SettingsSectionCard
                title="Project identity"
                subtitle={selectedProject.is_archived ? "Archived" : "Active"}
                actions={
                  <div className="flex items-center gap-1">
                    <IconButton
                      aria-label={
                        selectedProject.is_archived ? "Restore project" : "Archive project"
                      }
                      title={
                        selectedProject.is_archived ? "Restore project" : "Archive project"
                      }
                      onClick={() => handleArchiveToggle(selectedProject)}
                      className="text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-ink)]"
                    >
                      {selectedProject.is_archived ? (
                        <ArchiveRestore size={14} />
                      ) : (
                        <Archive size={14} />
                      )}
                    </IconButton>
                    {deleteConfirmId === selectedProject.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--color-ink-muted-foreground)]">
                          Delete "{selectedProject.name}"?
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(selectedProject.id)}
                        >
                          Delete
                        </Button>
                        <IconButton
                          aria-label="Cancel delete"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          <X size={14} />
                        </IconButton>
                      </div>
                    ) : (
                      <>
                        <IconButton
                          aria-label="Delete project"
                          title="Delete project"
                          onClick={() => setDeleteConfirmId(selectedProject.id)}
                          className="text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-warning)]"
                        >
                          <Trash2 size={14} />
                        </IconButton>
                        <IconButton
                          aria-label="Close detail"
                          title="Close detail"
                          onClick={() => setSelectedId(null)}
                        >
                          <X size={14} />
                        </IconButton>
                      </>
                    )}
                  </div>
                }
              >
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                      Name
                    </span>
                    <Input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => handleRename(selectedProject.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleRename(selectedProject.id);
                        }
                      }}
                      placeholder="Project name"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                        UID
                      </span>
                      <span className="font-[var(--font-label)] text-sm text-[var(--color-ink)]">
                        {selectedProject.uid}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                        Created
                      </span>
                      <span className="text-sm text-[var(--color-ink)]">
                        {new Date(selectedProject.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </SettingsSectionCard>

              <SettingsSectionCard
                title="Grants"
                subtitle={`${projectGrants.length} grant${projectGrants.length !== 1 ? "s" : ""}`}
                actions={
                  !addingGrant ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddingGrant(true)}
                    >
                      + Add Grant
                    </Button>
                  ) : undefined
                }
              >
                <div className="space-y-2">
                  {projectGrants.length === 0 && !addingGrant && (
                    <p className="text-xs text-[var(--color-ink-muted-foreground)]">
                      No Grants assigned yet.
                    </p>
                  )}

                  {projectGrants.map((grant) => (
                    <div
                      key={grant.id}
                      className="flex items-center justify-between rounded bg-[var(--color-panel-subtle)] px-3 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[var(--color-ink)]">
                          {grant.grantee_name}
                        </span>
                        <span className="text-xs text-[var(--color-ink-muted-foreground)]">
                          ({grant.grantee_type})
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            grant.role === "edit"
                              ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                              : "bg-[var(--color-panel)] text-[var(--color-ink)]"
                          }`}
                        >
                          {grant.role === "edit" ? "Edit" : "Read"}
                        </span>
                      </div>
                      <IconButton
                        aria-label={`Remove grant for ${grant.grantee_name}`}
                        title="Remove grant"
                        onClick={() =>
                          handleRemoveGrant(selectedProject.id, grant.id)
                        }
                        className="text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-warning)]"
                      >
                        <X size={14} />
                      </IconButton>
                    </div>
                  ))}

                  {addingGrant && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          aria-label="Grant role"
                          className="rounded-md border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                          value={grantRole}
                          onChange={(e) =>
                            setGrantRole(e.target.value as "read" | "edit")
                          }
                        >
                          <option value="read">Read</option>
                          <option value="edit">Edit</option>
                        </select>
                        <select
                          aria-label="Grant to user"
                          className="flex-1 rounded-md border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                          value={grantUserId ?? ""}
                          onChange={(e) => {
                            setGrantUserId(
                              e.target.value ? Number(e.target.value) : null,
                            );
                            setGrantTeamId(null);
                          }}
                        >
                          <option value="">Select a user…</option>
                          {peopleNotGranted(selectedProject.id).map((p) => (
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
                          className="flex-1 rounded-md border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                          value={grantTeamId ?? ""}
                          onChange={(e) => {
                            setGrantTeamId(
                              e.target.value ? Number(e.target.value) : null,
                            );
                            setGrantUserId(null);
                          }}
                        >
                          <option value="">Select a team…</option>
                          {teamsNotGranted(selectedProject.id).map((t) => (
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
                          onClick={() => handleAddGrant(selectedProject.id)}
                          disabled={!grantUserId && !grantTeamId}
                          aria-label="Add grant"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Add Grant
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAddingGrant(false);
                            setGrantUserId(null);
                            setGrantTeamId(null);
                          }}
                          aria-label="Cancel add grant"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </SettingsSectionCard>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-muted-foreground)]">
              Select a project from the list to view or edit its details.
            </div>
          )}
        </div>
      </div>
    </SettingsPageLayout>
  );
}
