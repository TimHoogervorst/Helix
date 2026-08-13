// ── Profile ─────────────────────────────────────────────────────────────────

/** Profile JSON shape stored on the User model (JSONField). */
export interface UserProfile {
  title?: string;
  position?: string;
  pronouns?: string;
  location?: string;
  bio?: string;
  orcid?: string;
}

// ── Profile list models ─────────────────────────────────────────────────────

export interface Affiliation {
  id: number;
  institution: string;
  role: string;
  department: string;
  start_date: string | null;
  end_date: string | null;
  order: number;
}

export interface Publication {
  id: number;
  title: string;
  journal: string;
  year: number | null;
  role: string;
  url: string;
  order: number;
}

export interface Recognition {
  id: number;
  title: string;
  issuer: string;
  date: string;
  order: number;
}

// ── Current user ────────────────────────────────────────────────────────────

/** Current user shape returned by GET /api/core/me/ */
export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  color: string;
  is_active: boolean;
  date_joined: string;
  profile: UserProfile;
  organization_role: "user" | "admin" | null;
  affiliations: Affiliation[];
  publications: Publication[];
  recognitions: Recognition[];
}
