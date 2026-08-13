import { useState, useEffect, useCallback } from "react";
import { Trash2, X, Check } from "lucide-react";
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
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { IconPickerPopover } from "../../../shell/src/shared/components/IconPickerPopover";
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("circle");
  const [newColor, setNewColor] = useState("muted");
  const [saving, setSaving] = useState(false);
  const [filterValue, setFilterValue] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

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
    setSaving(true);
    setError(null);
    try {
      await createTeam({
        name: newName.trim(),
        icon_key: newIcon,
        color_key: newColor,
      });
      setNewName("");
      setNewIcon("circle");
      setNewColor("muted");
      setShowNew(false);
      await load();
    } catch {
      setError("Failed to create Team.");
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (id: string | number) => {
    const teamId = Number(id);
    if (teamId === selectedId) {
      setSelectedId(null);
    } else {
      setSelectedId(teamId);
      const team = teams.find((t) => t.id === teamId);
      if (team) setNameDraft(team.name);
    }
    setAddingMember(false);
    setSelectedUserId(null);
    setDeleteConfirmId(null);
  };

  const handleRename = async (teamId: number) => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      const team = teams.find((t) => t.id === teamId);
      if (team) setNameDraft(team.name);
      return;
    }
    setError(null);
    try {
      await updateTeam(teamId, { name: trimmed });
      await load();
    } catch {
      setError("Failed to rename Team.");
    }
  };

  const handleIconColorChange = async (
    teamId: number,
    iconKey: string,
    colorKey: string,
  ) => {
    setError(null);
    try {
      await updateTeam(teamId, { icon_key: iconKey, color_key: colorKey });
      await load();
    } catch {
      setError("Failed to update Team icon and colour.");
    }
  };

  const handleDelete = async (teamId: number) => {
    try {
      await deleteTeam(teamId);
      setDeleteConfirmId(null);
      if (selectedId === teamId) setSelectedId(null);
      await load();
    } catch {
      setError("Failed to delete Team.");
    }
  };

  const handleAddMember = async (teamId: number) => {
    if (selectedUserId === null) return;
    try {
      await addTeamMember(teamId, selectedUserId);
      setAddingMember(false);
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

  const filteredTeams = filterValue
    ? teams.filter((t) =>
        t.name.toLowerCase().includes(filterValue.toLowerCase()),
      )
    : teams;

  const masterRows: MasterListRow[] = filteredTeams.map((t) => ({
    id: t.id,
    label: t.name,
    secondary: `${t.members.length} member${t.members.length !== 1 ? "s" : ""}`,
    icon: (
      <IconBadge
        iconKey={t.icon_key || "circle"}
        colorKey={t.color_key || "muted"}
        size="sm"
      />
    ),
  }));

  const selectedTeam = selectedId
    ? teams.find((t) => t.id === selectedId) ?? null
    : null;

  const teamMembersNot = (team: Team) =>
    people.filter((p) => !team.members.some((m) => m.id === p.user));

  if (loading) return <p className="empty">Loading…</p>;

  return (
    <SettingsPageLayout
      hero={
        <>
          <SettingsHeroHeader
            eyebrow="access control"
            title="Teams"
            description="Create and manage Teams. Team membership determines Project access through Grants."
            actions={
              <Button size="sm" onClick={() => setShowNew(!showNew)}>
                {showNew ? "Cancel" : "+ New Team"}
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
                    placeholder="Team name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-ink-muted-foreground)]">
                    Icon &amp; Colour
                  </span>
                  <IconPickerPopover
                    iconKey={newIcon}
                    colorKey={newColor}
                    size="sm"
                    onChange={(iconKey, colorKey) => {
                      setNewIcon(iconKey);
                      setNewColor(colorKey);
                    }}
                  />
                </div>
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
                      setNewIcon("circle");
                      setNewColor("muted");
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
            filterPlaceholder="Filter teams"
          />
          {masterRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--color-ink-muted-foreground)]">
              No teams found.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-4 p-6">
          {selectedTeam ? (
            <>
              <SettingsSectionCard
                title="Team details"
                subtitle={`${selectedTeam.members.length} member${selectedTeam.members.length !== 1 ? "s" : ""}`}
                actions={
                  <div className="flex items-center gap-1">
                    {deleteConfirmId === selectedTeam.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--color-ink-muted-foreground)]">
                          Delete "{selectedTeam.name}"?
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(selectedTeam.id)}
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
                          aria-label="Delete team"
                          title="Delete team"
                          onClick={() => setDeleteConfirmId(selectedTeam.id)}
                          className="text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-warning)]"
                          disabled={selectedTeam.blocked_from_deletion}
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
                <label className="block">
                  <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                    Name
                  </span>
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => handleRename(selectedTeam.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleRename(selectedTeam.id);
                      }
                    }}
                    placeholder="Team name"
                  />
                </label>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                    Icon &amp; Colour
                  </span>
                  <IconPickerPopover
                    iconKey={selectedTeam.icon_key || "circle"}
                    colorKey={selectedTeam.color_key || "muted"}
                    size="md"
                    onChange={(iconKey, colorKey) =>
                      handleIconColorChange(selectedTeam.id, iconKey, colorKey)
                    }
                  />
                </div>
                {selectedTeam.blocked_from_deletion && (
                  <p className="mt-2 text-xs text-[var(--color-ink-muted-foreground)]">
                    This team cannot be deleted because it has active Grants.
                  </p>
                )}
              </SettingsSectionCard>

              <SettingsSectionCard
                title="Members"
                subtitle={`${selectedTeam.members.length} member${selectedTeam.members.length !== 1 ? "s" : ""}`}
                actions={
                  !addingMember ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddingMember(true)}
                    >
                      + Add Member
                    </Button>
                  ) : undefined
                }
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {selectedTeam.members.map((member) => {
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
                            onClick={() =>
                              handleRemoveMember(selectedTeam.id, member.id)
                            }
                            className="ml-0.5 rounded-full p-0.5 text-[var(--color-ink-muted-foreground)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                            aria-label={`Remove ${displayName} from ${selectedTeam.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                    {selectedTeam.members.length === 0 && (
                      <p className="text-xs text-[var(--color-ink-muted-foreground)]">
                        No members yet.
                      </p>
                    )}
                  </div>

                  {addingMember && (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Select user to add"
                        className="flex-1 rounded-md border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                        value={selectedUserId ?? ""}
                        onChange={(e) =>
                          setSelectedUserId(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      >
                        <option value="">Select a user…</option>
                        {teamMembersNot(selectedTeam).map((p) => (
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
                        onClick={() => handleAddMember(selectedTeam.id)}
                        disabled={selectedUserId === null}
                        aria-label="Add member"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Add
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAddingMember(false);
                          setSelectedUserId(null);
                        }}
                        aria-label="Cancel add member"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </SettingsSectionCard>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-muted-foreground)]">
              Select a team from the list to view or edit its details.
            </div>
          )}
        </div>
      </div>
    </SettingsPageLayout>
  );
}
