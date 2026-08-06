import { MapPin, Mail, Building2 } from "lucide-react";
import { useCurrentUser } from "../../../shell/src/user/CurrentUserProvider";
import { Avatar, getInitials } from "../../../shell/src/user/Avatar";

/**
 * Full-width profile header section with grid-paper background:
 *  - Extra-large avatar on the left
 *  - Position in lab (smaller gray text)
 *  - Title + Name (big bold), pronouns in parentheses
 *  - Icon row: location pin, ORCID (building icon), email
 */
export function ProfileHeader() {
  const { user } = useCurrentUser();
  if (!user) return null;

  const initials = getInitials(user);
  const displayName =
    user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.username;

  // Prefix title if present (e.g. "Dr. Barbara Morrison")
  const titledName = user.profile.title
    ? `${user.profile.title} ${displayName}`
    : displayName;

  return (
    <section className="grid-paper w-full border-b border-hairline py-10">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-start gap-5">
          {/* Avatar — extra large, in a subtle card */}
          <span className="inline-flex shrink-0 rounded-xl border border-border bg-card p-1.5">
            <Avatar initials={initials} color={user.color} size="xl" />
          </span>

          {/* Content — sized to match avatar height */}
          <div className="flex min-h-20 flex-col justify-center">
            {/* Position in lab — smaller gray text */}
            {user.profile.position && (
              <p className="text-[13px] text-muted-foreground">
                {user.profile.position}
              </p>
            )}

            {/* Title + Name (pronouns) — big bold black */}
            <h1 className="font-[--font-body] text-3xl font-bold tracking-tight text-foreground">
              {titledName}
              {user.profile.pronouns && (
                <span className="ml-2 text-lg font-normal text-muted-foreground">
                  ({user.profile.pronouns})
                </span>
              )}
            </h1>

            {/* Icon row — location, ORCID, email */}
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {user.profile.location && (
                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {user.profile.location}
                </span>
              )}
              {user.profile.orcid && (
                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Building2 className="h-3 w-3" aria-hidden="true" />
                  {user.profile.orcid}
                </span>
              )}
              {user.email && (
                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Mail className="h-3 w-3" aria-hidden="true" />
                  {user.email}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
