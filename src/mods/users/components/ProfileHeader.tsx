import { MapPin, Mail } from "lucide-react";
import { useCurrentUser } from "../../../shell/src/user/CurrentUserProvider";
import { Avatar, getInitials } from "../../../shell/src/user/Avatar";

/**
 * Full-width profile header section:
 *  - Large avatar
 *  - Display name (first_name + last_name, fallback to username)
 *  - Position (from profile)
 *  - Affiliation line (derived from last Affiliation)
 *  - Location, email, ORCID as metadata chips
 */
export function ProfileHeader() {
  const { user } = useCurrentUser();
  if (!user) return null;

  const initials = getInitials(user);
  const displayName =
    user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.username;

  // Derive an affiliation line from the last affiliation (by order)
  const lastAffiliation = [...user.affiliations].sort(
    (a, b) => b.order - a.order,
  )[0];
  const affiliationLine = lastAffiliation
    ? `${lastAffiliation.role}, ${lastAffiliation.department}, ${lastAffiliation.institution}`
    : null;

  return (
    <section className="w-full border-b border-hairline bg-surface/60 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          {/* Avatar */}
          <Avatar initials={initials} color={user.color} size="lg" />

          {/* Name + metadata */}
          <div className="flex-1">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">
              {displayName}
            </h1>

            {user.profile.position && (
              <p className="mt-0.5 text-base text-muted-foreground">
                {user.profile.position}
              </p>
            )}

            {affiliationLine && (
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {affiliationLine}
              </p>
            )}

            {/* Metadata chips row */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {user.profile.location && (
                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {user.profile.location}
                </span>
              )}
              {user.email && (
                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Mail className="h-3 w-3" aria-hidden="true" />
                  {user.email}
                </span>
              )}
              {user.profile.orcid && (
                <span className="chip text-[11px]">
                  ORCID: {user.profile.orcid}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
