import { useState, useEffect, useCallback, type FormEvent } from "react";
import { Users, UserPlus, Shield, X } from "lucide-react";
import { listUsers, createUser, deactivateUser, deleteUser, fetchCoreSetting, updateCoreSetting } from "../api";
import { Avatar, getInitials } from "../../../shell/src/shared/Avatar";
import { formatDate } from "../../../shell/src/shared/format";
import type { CurrentUser } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Main component ──────────────────────────────────────────────────────────

export default function UserManagement() {
  // User list state
  const [users, setUsers] = useState<CurrentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Self-registration toggle
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(true);
  const [toggleSaving, setToggleSaving] = useState(false);

  // ── Fetch users ─────────────────────────────────────────────────────────

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

  // ── Fetch self-registration setting ─────────────────────────────────────

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

  // ── Create user ─────────────────────────────────────────────────────────

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newUsername.trim() || !newPassword.trim()) {
      setCreateError("Username and password are required.");
      return;
    }

    setCreating(true);
    try {
      await createUser(newUsername.trim(), newPassword);
      setNewUsername("");
      setNewPassword("");
      await fetchUsers();
    } catch (err) {
      if (err instanceof Error && "status" in err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apiErr = err as unknown as { status: number; data: unknown };
        if (apiErr.status === 400 && typeof apiErr.data === "object" && apiErr.data !== null) {
          // Extract DRF serializer errors
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

  // ── Deactivate user ─────────────────────────────────────────────────────

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
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  // ── Toggle self-registration ────────────────────────────────────────────

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

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) return <p className="p-4 text-[13px] text-muted-foreground">Loading users…</p>;

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* ── Page-level error ─────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
          <button
            className="ml-3 underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Section: User table ──────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            All Users
          </h2>
          <span className="text-[11px] text-muted-foreground">
            ({users.length})
          </span>
        </div>

        {users.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No users found.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-hairline">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-hairline bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    User
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Joined
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-hairline last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar
                          initials={getInitials(user)}
                          color={user.color}
                          size="sm"
                        />
                        <span className="font-medium">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(user.date_joined)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip active={user.is_active} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {user.is_active ? (
                        <button
                          className="btn-ghost text-[12px] text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeactivate(user)}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className="btn-ghost p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(user)}
                          title="Delete"
                          aria-label={`Delete ${user.username}`}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section: Create user ─────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            Create User
          </h2>
        </div>

        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-3 rounded-lg border border-hairline p-4"
        >
          {createError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {createError}
            </div>
          )}

          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Username</span>
              <input
                type="text"
                className="input rounded-md w-48"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                autoComplete="off"
                required
                minLength={3}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Password</span>
              <input
                type="password"
                className="input rounded-md w-48"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <button
              type="submit"
              className="btn-primary rounded-md px-4 py-1.5 text-[13px] font-medium"
              disabled={creating}
            >
              {creating ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </section>

      {/* ── Section: Self-registration toggle ────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            Registration
          </h2>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-hairline p-4">
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
      </section>
    </div>
  );
}
