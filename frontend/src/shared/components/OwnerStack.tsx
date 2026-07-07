/**
 * OwnerStack — stacked user avatars showing item ownership.
 *
 * Currently renders a single user avatar inline (matching the existing
 * `card-owner` rendering in BaseCard). Future: renders overlapping avatar
 * circles for multiple owners / collaborators.
 */

import { Avatar, getInitials } from "../Avatar";

export interface OwnerInfo {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  color: string;
}

export interface OwnerStackProps {
  /** The owner(s) to display. Currently only the first entry is rendered. */
  owners: OwnerInfo[];
}

function OwnerStack({ owners }: OwnerStackProps) {
  if (owners.length === 0) return null;

  const owner = owners[0];

  return (
    <div className="owner-stack">
      <Avatar
        initials={getInitials(owner)}
        color={owner.color}
        size="sm"
      />
      <span className="owner-stack-username">{owner.username}</span>
    </div>
  );
}

export default OwnerStack;
