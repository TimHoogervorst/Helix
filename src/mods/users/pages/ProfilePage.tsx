import { useState, type FormEvent } from "react";
import { useCurrentUser } from "../../../core/user/CurrentUserProvider";
import { Avatar, getInitials } from "../../../core/user/Avatar";
import { updateMe, changePassword } from "../../../core/user/api";
import { ApiError } from "../../../core/api/client";

/** Extract the first error message from a DRF field-error array or object. */
function fieldError(
  errors: unknown,
  field: string,
): string | null {
  if (!errors || typeof errors !== "object") return null;
  const record = errors as Record<string, unknown>;
  const value = record[field];
  if (Array.isArray(value) && value.length > 0) {
    return String(value[0]);
  }
  if (typeof value === "string") return value;
  return null;
}

export default function ProfilePage() {
  const { user, refresh } = useCurrentUser();

  // ── Username form ──────────────────────────────────────────────────────
  const [username, setUsername] = useState(user?.username ?? "");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);

  // ── Password form ──────────────────────────────────────────────────────
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>(
    {},
  );
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  if (!user) return null;

  const initials = getInitials(user);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleUsernameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setUsernameError(null);
    setUsernameSuccess(false);

    if (!username.trim()) {
      setUsernameError("Username cannot be empty.");
      return;
    }

    if (username.trim() === user.username) {
      setUsernameError("Username is the same as your current username.");
      return;
    }

    setSavingUsername(true);
    try {
      const updated = await updateMe({ username: username.trim() });
      setUsername(updated.username);
      setUsernameSuccess(true);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setUsernameError(
          fieldError(err.data, "username") ?? "Invalid username.",
        );
      } else {
        setUsernameError("Something went wrong. Please try again.");
      }
    } finally {
      setSavingUsername(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordErrors({});
    setPasswordSuccess(false);

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!oldPassword) errors.old_password = "Current password is required.";
    if (!newPassword) errors.new_password = "New password is required.";
    if (newPassword && newPassword !== confirmPassword) {
      errors.confirm_password = "Passwords do not match.";
    }
    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(oldPassword, newPassword, confirmPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        const apiErrors: Record<string, string> = {};
        for (const field of [
          "old_password",
          "new_password",
          "confirm_password",
        ]) {
          const msg = fieldError(err.data, field);
          if (msg) apiErrors[field] = msg;
        }
        // DRF may also return non-field errors as a list under "non_field_errors"
        // or as a plain string "detail"
        if (Object.keys(apiErrors).length === 0) {
          const detail =
            fieldError(err.data, "detail") ?? "Password change failed.";
          apiErrors.old_password = detail;
        }
        setPasswordErrors(apiErrors);
      } else {
        setPasswordErrors({
          old_password: "Something went wrong. Please try again.",
        });
      }
    } finally {
      setChangingPassword(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-xl">
      <h2 className="text-lg font-semibold mb-6">Profile</h2>

      {/* ── Avatar (read-only) ──────────────────────────────────────────── */}
      <div className="mb-8 flex items-center gap-4 rounded-md border border-hairline bg-panel p-4">
        <Avatar initials={initials} color={user.color} size="lg" />
        <div>
          <p className="font-medium">{user.username}</p>
          <p className="text-[13px] text-muted-foreground">Avatar</p>
        </div>
      </div>

      {/* ── Edit Username ────────────────────────────────────────────────── */}
      <form onSubmit={handleUsernameSubmit} className="mb-6">
        <h3 className="text-base font-medium mb-3">Edit Username</h3>

        {usernameError && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {usernameError}
          </div>
        )}

        {usernameSuccess && (
          <div className="mb-3 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-[13px] text-green-600 dark:text-green-400">
            Username updated.
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Username</span>
          <input
            type="text"
            className="input rounded-md"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameError(null);
              setUsernameSuccess(false);
            }}
            autoComplete="username"
            required
          />
        </label>

        <button
          type="submit"
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          disabled={savingUsername}
        >
          {savingUsername ? "Saving…" : "Save"}
        </button>
      </form>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <hr className="my-8 border-hairline" />

      {/* ── Change Password ──────────────────────────────────────────────── */}
      <form onSubmit={handlePasswordSubmit}>
        <h3 className="text-base font-medium mb-3">Change Password</h3>

        {passwordSuccess && (
          <div className="mb-3 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-[13px] text-green-600 dark:text-green-400">
            Password changed.
          </div>
        )}

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Current Password</span>
            <input
              type="password"
              className="input rounded-md"
              value={oldPassword}
              onChange={(e) => {
                setOldPassword(e.target.value);
                setPasswordErrors((prev) => {
                  const next = { ...prev };
                  delete next.old_password;
                  return next;
                });
                setPasswordSuccess(false);
              }}
              autoComplete="current-password"
              required
            />
            {passwordErrors.old_password && (
              <span className="text-[13px] text-destructive">
                {passwordErrors.old_password}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">New Password</span>
            <input
              type="password"
              className="input rounded-md"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordErrors((prev) => {
                  const next = { ...prev };
                  delete next.new_password;
                  return next;
                });
                setPasswordSuccess(false);
              }}
              autoComplete="new-password"
              required
            />
            {passwordErrors.new_password && (
              <span className="text-[13px] text-destructive">
                {passwordErrors.new_password}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">
              Confirm New Password
            </span>
            <input
              type="password"
              className="input rounded-md"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordErrors((prev) => {
                  const next = { ...prev };
                  delete next.confirm_password;
                  return next;
                });
                setPasswordSuccess(false);
              }}
              autoComplete="new-password"
              required
            />
            {passwordErrors.confirm_password && (
              <span className="text-[13px] text-destructive">
                {passwordErrors.confirm_password}
              </span>
            )}
          </label>
        </div>

        <button
          type="submit"
          className="mt-4 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          disabled={changingPassword}
        >
          {changingPassword ? "Changing…" : "Change Password"}
        </button>
      </form>
    </div>
  );
}
