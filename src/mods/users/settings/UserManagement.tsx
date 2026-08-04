import { useState, useEffect, useCallback } from "react";
import { User, Trash2, X } from "lucide-react";
import { listUsers, createUser, deactivateUser, deleteUser, fetchCoreSetting, updateCoreSetting } from "../api";
import { formatDate } from "../../../shell/src/shared/format";
import type { CurrentUser } from "../types";
import { SettingsPageLayout } from "../../../shell/src/shared/components/SettingsPageLayout";
import { SettingsHeroHeader } from "../../../shell/src/shared/components/SettingsHeroHeader";
import { SettingsSectionCard } from "../../../shell/src/shared/components/SettingsSectionCard";
import {
  SettingsMasterList,
  type MasterListRow,
} from "../../../shell/src/shared/components/SettingsMasterList";

function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        active
          ? "bg-success/15 text-success-foreground"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export default function UserManagement() {
  const [users, setUsers] = useState<CurrentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterValue, setFilterValue] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [allowRegistration, setAllowRegistration] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(true);
  const [toggleSaving, setToggleSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const setting = await fetchCoreSetting("allow_self_registration");
        if (!cancelled) {
          setAllowRegistration(!!setting.value);
        }
      } catch {
        // Setting may not exist yet — default to false
      } finally {
        if (!cancelled) setToggleLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async () => {
    setCreateError(null);

    if (!newUsername.trim() || !newPassword.trim()) {
      setCreateError("Username and password are required.");
      return;
    }

    setCreating(true);
    try {
      await createUser(newUsername.trim(), newPassword);
      setShowNew(false);
      setNewUsername("");
      setNewPassword("");
      await fetchUsers();
    } catch (err) {
      if (err instanceof Error && "status" in err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apiErr = err as unknown as { status: number; data: unknown };
        if (apiErr.status === 400 && typeof apiErr.data === "object" && apiErr.data !== null) {
          const data = apiErr.data as Record<string, string[]>;
          const messages = Object.entries(data)
            .map(([, msgs]) => msgs.join(" "))
            .join(" ");
          setCreateError(messages || "Invalid input.");
        } else {
          setCreateError("Failed to create user.");
        }
      } else {
        setCreateError("Something went wrong.");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (user: CurrentUser) => {
    if (!window.confirm(`Deactivate user "${user.username}"?`)) return;

    try {
      await deactivateUser(user.id);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate user");
    }
  };

  const handleDelete = async (user: CurrentUser) => {
    if (!window.confirm(`Permanently delete user "${user.username}"? This cannot be undone.`)) return;

    try {
      await deleteUser(user.id);
      if (selectedId === user.id) setSelectedId(null);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleToggleRegistration = async () => {
    const next = !allowRegistration;
    setToggleSaving(true);
    try {
      await updateCoreSetting("allow_self_registration", next);
      setAllowRegistration(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update setting",
      );
    } finally {
      setToggleSaving(false);
    }
  };

  const handleSelect = (id: string | number) => {
    const userId = Number(id);
    if (selectedId === userId) {
      setSelectedId(null);
    } else {
      setSelectedId(userId);
    }
  };

  const filteredUsers = filterValue
    ? users.filter((u) =>
        u.username.toLowerCase().includes(filterValue.toLowerCase()),
      )
    : users;

  const masterRows: MasterListRow[] = filteredUsers.map((u) => ({
    id: u.id,
    label: u.username,
    secondary: u.email,
    icon: <User size={13} />,
  }));

  const selectedUser = selectedId
    ? users.find((u) => u.id === selectedId) ?? null
    : null;

  if (loading) return <p className="empty">Loading users…</p>;

  return (
    <SettingsPageLayout
      hero={
        <>
          <SettingsHeroHeader
            eyebrow="user management"
            title="Users"
            description="Manage user accounts, create new users, and control self-registration settings."
            actions={
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? "Cancel" : "+ New User"}
              </button>
            }
          />

          {showNew && (
            <div className="mb-6 rounded-lg border border-hairline bg-panel p-4">
              {createError && (
                <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                  {createError}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Username</span>
                  <input
                    type="text"
                    className="rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary/50 w-48"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    autoComplete="off"
                    placeholder="e.g., jdoe"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Password</span>
                  <input
                    type="password"
                    className="rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary/50 w-48"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    onClick={handleCreate}
                    disabled={creating}
                  >
                    {creating ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
                    onClick={() => {
                      setShowNew(false);
                      setNewUsername("");
                      setNewPassword("");
                      setCreateError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-md border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          {error}
          <button
            className="ml-3 underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
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
            filterPlaceholder="Filter users"
          />
          {masterRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No users found.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-4 p-6">
          {selectedUser ? (
            <SettingsSectionCard
              title="User details"
              subtitle={selectedUser.email}
              actions={
                <div className="flex items-center gap-1">
                  {selectedUser.is_active ? (
                    <button
                      type="button"
                      className="rounded border-transparent bg-transparent px-2 py-1 text-[11px] text-warn transition-colors hover:bg-muted hover:text-destructive"
                      onClick={() => handleDeactivate(selectedUser)}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded border-transparent bg-transparent p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-warn"
                      onClick={() => handleDelete(selectedUser)}
                      title="Delete user"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded border-transparent bg-transparent p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => setSelectedId(null)}
                    title="Close detail"
                  >
                    <X size={14} />
                  </button>
                </div>
              }
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Username
                    </span>
                    <span className="text-sm text-foreground">
                      {selectedUser.username}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Name
                    </span>
                    <span className="text-sm text-foreground">
                      {[selectedUser.first_name, selectedUser.last_name]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Status
                    </span>
                    <StatusChip active={selectedUser.is_active} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Joined
                    </span>
                    <span className="text-sm text-foreground">
                      {formatDate(selectedUser.date_joined)}
                    </span>
                  </div>
                </div>
              </div>
            </SettingsSectionCard>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a user from the list to view or edit their details.
            </div>
          )}

          <SettingsSectionCard title="Registration">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium">Allow self-registration</p>
                <p className="text-[12px] text-muted-foreground">
                  When enabled, anyone can create an account from the login page.
                </p>
              </div>

              {toggleLoading ? (
                <span className="text-[12px] text-muted-foreground">Loading…</span>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={allowRegistration}
                  aria-label="Toggle self-registration"
                  disabled={toggleSaving}
                  onClick={handleToggleRegistration}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    allowRegistration ? "bg-primary" : "bg-muted-foreground/25"
                  } ${toggleSaving ? "opacity-50" : ""}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                      allowRegistration ? "translate-x-[18px]" : "translate-x-[3px]"
                    }`}
                  />
                </button>
              )}
            </div>
          </SettingsSectionCard>
        </div>
      </div>
    </SettingsPageLayout>
  );
}
