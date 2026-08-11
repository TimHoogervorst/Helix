import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Check, X, UserPlus } from "lucide-react";
import { Button } from "../../../shell/src/shared/primitives/Button";
import {
  fetchTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  fetchPeople,
} from "../api";
import type { Team, Person } from "../types";

export default function TeamsManagement() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [addingMemberId, setAddingMemberId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamsData, peopleData] = await Promise.all([
        fetchTeams(),
        fetchPeople(),
      ]);
      setTeams(teamsData);
      setPeople(peopleData);
    } catch {
      setError("Failed to load Teams.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createTeam({ name: newName.trim() });
      setNewName("");
      setCreating(false);
      await load();
    } catch {
      // keep form on failure
    }
  };

  const handleRename = async (teamId: number) => {
    if (!draftName.trim()) return;
    try {
      await updateTeam(teamId, { name: draftName.trim() });
      setEditingId(null);
      await load();
    } catch {
      // keep editing on failure
    }
  };

  const handleDelete = async (teamId: number) => {
    try {
      await deleteTeam(teamId);
      setDeleteConfirmId(null);
      await load();
    } catch {
      setError("Failed to delete Team.");
    }
  };

  const handleAddMember = async (teamId: number) => {
    if (selectedUserId === null) return;
    try {
      await addTeamMember(teamId, selectedUserId);
      setAddingMemberId(null);
      setSelectedUserId(null);
      await load();
    } catch {
      // keep form on failure
    }
  };

  const handleRemoveMember = async (teamId: number, userId: number) => {
    try {
      await removeTeamMember(teamId, userId);
      await load();
    } catch {
      // ignore
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

  const teamMembersNot = (team: Team) =>
    people.filter((p) => !team.members.some((m) => m.id === p.user));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">
            Teams
          </h2>
          <p className="text-sm text-[var(--color-ink-muted-foreground)]">
            Create and manage Teams. Team membership determines Project access
            through Grants.
          </p>
        </div>
        {!creating && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreating(true)}
            aria-label="Create a new Team"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Create Team
          </Button>
        )}
      </div>

      {creating && (
        <div className="flex items-center gap-2 rounded-lg border border-hairline bg-panel p-3">
          <input
            aria-label="New Team name"
            className="flex-1 rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
            placeholder="Team name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <Button variant="primary" size="sm" onClick={handleCreate} aria-label="Confirm create team">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Create
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setNewName(""); }} aria-label="Cancel create team">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      {teams.length === 0 && !creating && (
        <p className="text-sm text-[var(--color-ink-muted-foreground)]">
          No Teams have been created yet.
        </p>
      )}

      <div className="space-y-3">
        {teams.map((team) => (
          <div
            key={team.id}
            className="rounded-lg border border-hairline bg-panel p-4"
          >
            <div className="flex items-center justify-between">
              {editingId === team.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    aria-label="Rename Team"
                    className="flex-1 rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    autoFocus
                  />
                  <Button variant="primary" size="sm" onClick={() => handleRename(team.id)} aria-label="Confirm rename">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} aria-label="Cancel rename">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ) : deleteConfirmId === team.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <span className="text-sm text-[var(--color-ink)]">
                    Delete <strong>{team.name}</strong>?
                  </span>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(team.id)} aria-label="Confirm delete">
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)} aria-label="Cancel delete">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <>
                  <span
                    className="cursor-pointer text-sm font-medium text-[var(--color-ink)] hover:text-[var(--color-primary)]"
                    onClick={() => { setEditingId(team.id); setDraftName(team.name); }}
                    title="Click to rename"
                  >
                    {team.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setEditingId(team.id); setDraftName(team.name); }}
                      aria-label={`Rename ${team.name}`}
                      title="Rename"
                    >
                      Rename
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteConfirmId(team.id)}
                      aria-label={`Delete ${team.name}`}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-1">
                {team.members.map((member) => {
                  const displayName =
                    member.first_name || member.last_name
                      ? `${member.first_name} ${member.last_name}`.trim()
                      : member.username;
                  return (
                    <span
                      key={member.id}
                      className="inline-flex items-center gap-1 rounded bg-[var(--color-panel-subtle)] px-2 py-0.5 text-xs text-[var(--color-ink)]"
                    >
                      {displayName}
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(team.id, member.id)}
                        className="ml-0.5 rounded-full p-0.5 text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                        aria-label={`Remove ${displayName} from ${team.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>

              {addingMemberId === team.id ? (
                <div className="mt-2 flex items-center gap-2">
                  <select
                    aria-label="Select user to add"
                    className="flex-1 rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                    value={selectedUserId ?? ""}
                    onChange={(e) =>
                      setSelectedUserId(e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">Select a user…</option>
                    {teamMembersNot(team).map((p) => (
                      <option key={p.user} value={p.user}>
                        {p.first_name || p.last_name
                          ? `${p.first_name} ${p.last_name}`.trim()
                          : p.username}{" "}
                        (@{p.username})
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleAddMember(team.id)}
                    disabled={selectedUserId === null}
                    aria-label="Add member"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Add
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setAddingMemberId(null); setSelectedUserId(null); }}
                    aria-label="Cancel add member"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingMemberId(team.id)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-ink)]"
                  aria-label={`Add member to ${team.name}`}
                >
                  <UserPlus className="h-3 w-3" />
                  Add member
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
