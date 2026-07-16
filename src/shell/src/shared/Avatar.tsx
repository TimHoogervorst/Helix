/** Shared Avatar component and initial-generation utility.
 *
 * Used by the ELN mod, users mod, and core shell (UserMenu).
 */

/** Get initials from user's first_name + last_name, falling back to username. */
export function getInitials(user: {
  first_name?: string;
  last_name?: string;
  username: string;
}): string {
  const first = user.first_name?.trim();
  const last = user.last_name?.trim();
  if (first && last) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }
  if (first && first.length >= 2) {
    return first.slice(0, 2).toUpperCase();
  }
  return user.username.slice(0, 2).toUpperCase();
}

interface AvatarProps {
  initials: string;
  color: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-5 w-5 text-[8px]",
  md: "h-7 w-7 text-[10px]",
  lg: "h-9 w-9 text-[13px]",
};

export function Avatar({ initials, color, size = "md" }: AvatarProps) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full font-mono font-medium ring-2 ring-background ${sizeClasses[size]}`}
      style={{ backgroundColor: color, color: "#fff" }}
      aria-label={initials}
    >
      {initials}
    </span>
  );
}
