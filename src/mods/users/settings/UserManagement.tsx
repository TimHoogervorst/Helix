import { useState, useEffect, useCallback } from "react";
import { User, Trash2, X } from "lucide-react";
import { listUsers, createUser, deactivateUser, deleteUser, fetchCoreSetting, updateCoreSetting } from "../api";
import { formatDate } from "../../../shell/src/shared/format";
import type { CurrentUser } from "../types";
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

function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? "bg-[var(--color-success)]/15 text-[var(--color-success-foreground)]"
          : "bg-[var(--color-surface-hover)] text-[var(--color-ink-muted-foreground)]"
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
              <Button
                size="sm"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? "Cancel" : "+ New User"}
              </Button>
            }
          />

          {showNew && (
            <div className="mb-6 rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-4">
              {createError && (
                <div className="mb-3 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-3 py-2 text-base text-[var(--color-destructive)]">
                  {createError}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-ink-muted-foreground)]">Username</span>
                  <Input
                    className="w-48"
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
                  <span className="text-xs text-[var(--color-ink-muted-foreground)]">Password</span>
                  <Input
                    type="password"
                    className="w-48"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={creating}
                  >
                    {creating ? "Creating…" : "Create"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNew(false);
                      setNewUsername("");
                      setNewPassword("");
                      setCreateError(null);
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
            <p className="px-3 py-2 text-xs text-[var(--color-ink-muted-foreground)]">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[--color-warning] hover:text-[--color-destructive]"
                      onClick={() => handleDeactivate(selectedUser)}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <IconButton
                      aria-label="Delete user"
                      title="Delete user"
                      onClick={() => handleDelete(selectedUser)}
                      className="text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-warning)]"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  )}
                  <IconButton
                    aria-label="Close detail"
                    onClick={() => setSelectedId(null)}
                  >
                    <X size={14} />
                  </IconButton>
                </div>
              }
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                      Username
                    </span>
                    <span className="text-sm text-[var(--color-ink)]">
                      {selectedUser.username}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                      Name
                    </span>
                    <span className="text-sm text-[var(--color-ink)]">
                      {[selectedUser.first_name, selectedUser.last_name]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                      Status
                    </span>
                    <StatusChip active={selectedUser.is_active} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                      Joined
                    </span>
                    <span className="text-sm text-[var(--color-ink)]">
                      {formatDate(selectedUser.date_joined)}
                    </span>
                  </div>
                </div>
              </div>
            </SettingsSectionCard>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-muted-foreground)]">
              Select a user from the list to view or edit their details.
            </div>
          )}

          <SettingsSectionCard title="Registration">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-medium">Allow self-registration</p>
                <p className="text-sm text-[var(--color-ink-muted-foreground)]">
                  When enabled, anyone can create an account from the login page.
                </p>
              </div>

              {toggleLoading ? (
                <span className="text-sm text-[var(--color-ink-muted-foreground)]">Loading…</span>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={allowRegistration}
                  aria-label="Toggle self-registration"
                  disabled={toggleSaving}
                  onClick={handleToggleRegistration}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    allowRegistration ? "bg-[var(--color-primary)]" : "bg-[var(--color-ink-muted-foreground)]/25"
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
