import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { User, Settings, LogOut, Crown } from "lucide-react";
import { useCurrentUser } from "./CurrentUserProvider";
import { Avatar, getInitials } from "./Avatar";
import { logout } from "./api";
import { useClickOutside } from "../shared/hooks/useClickOutside";

export interface UserMenuProps {
  /**
   * When true, renders a compact trigger suitable for collapsed sidebars:
   * just the avatar button without the username text. The popover still
   * opens with the full menu. Defaults to false.
   */
  compact?: boolean;
}

/**
 * Popover card triggered by clicking the sidebar avatar.
 *
 * Shows a mini header (avatar + username) and four items:
 *   Profile, Preferences (placeholder), Settings, Logout.
 */
export function UserMenu({ compact = false }: UserMenuProps) {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useClickOutside(menuRef, () => setOpen(false), open);

  if (!user) return null;

  const initials = getInitials(user);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Proceed with redirect even if the logout API fails
    }
    window.location.href = "/login";
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* ── Trigger button ──────────────────────────────────────────── */}
      <button
        className={
          compact
            ? "btn-ghost flex items-center justify-center w-full py-2 hover:bg-muted transition-colors"
            : "btn-ghost w-full gap-2 border-t border-hairline px-3 py-2.5 hover:bg-muted transition-colors"
        }
        onClick={() => setOpen((prev) => !prev)}
        aria-label="User menu"
      >
        <Avatar
          initials={initials}
          color={user.color}
          size={compact ? "sm" : "md"}
        />
        {!compact && (
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[13px] font-medium truncate">
              {user.username}
            </span>
          </div>
        )}
      </button>

      {/* ── Popover card ────────────────────────────────────────────── */}
      {open && (
        <div
          className={
            compact
              ? "absolute bottom-full left-0 mb-1 z-50 w-48 rounded-lg border border-hairline bg-panel shadow-lg p-1"
              : "absolute bottom-full left-2 right-2 mb-1 z-50 rounded-lg border border-hairline bg-panel shadow-lg p-1"
          }
        >
          {/* Mini header */}
          <div className="flex items-center gap-2 border-b border-hairline px-3 py-2.5">
            <Avatar initials={initials} color={user.color} size="md" />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[13px] font-medium truncate">
                {user.username}
              </span>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              className="btn-ghost w-full"
              onClick={() => {
                navigate("/profile");
                setOpen(false);
              }}
            >
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              Profile
            </button>
            <button
              className="btn-ghost w-full cursor-not-allowed"
              disabled
              title="Coming soon"
              aria-label="Preferences — coming soon"
            >
              <Crown className="h-3.5 w-3.5" aria-hidden="true" />
              Preferences
            </button>
            <button
              className="btn-ghost w-full"
              onClick={() => {
                navigate("/settings");
                setOpen(false);
              }}
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              Settings
            </button>
            <div className="my-1 border-t border-hairline" />
            <button
              className="btn-ghost w-full !text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
