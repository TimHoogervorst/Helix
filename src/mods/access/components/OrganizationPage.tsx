import { useState, useEffect, useCallback } from "react";
import { useCurrentUser } from "../../../shell/src/user/CurrentUserProvider";
import { TabBar } from "../../../shell/src/shared/primitives/TabBar";
import { Avatar, getInitials } from "../../../shell/src/user/Avatar";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { fetchOrganization, fetchPeople, fetchPolicies, fetchTeams, updateOrganization } from "../api";
import type { AccessPolicy, Organization, Person, Team } from "../types";
import { Pencil, Check, X } from "lucide-react";

const CORE_ACTION_LABELS: Record<string, string> = {
  read: "Read",
  created: "Created",
  edited: "Edited",
  deleted: "Deleted",
};

const LEVEL_LABELS: Record<string, string> = {
  read: "Read",
  edit: "Edit",
  admin: "Organization Admin",
  owner: "Owner",
  authenticated: "Authenticated",
  public: "Public",
};

export default function OrganizationPage() {
  const { user } = useCurrentUser();
  const [org, setOrg] = useState<Organization | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [policies, setPolicies] = useState<AccessPolicy[]>([]);
  const [activeTab, setActiveTab] = useState("people");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Pick<Organization, "name" | "short_description" | "address">>({
    name: "",
    short_description: "",
    address: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgData, peopleData, teamsData, policiesData] = await Promise.all([
        fetchOrganization(),
        fetchPeople(),
        fetchTeams(),
        fetchPolicies(),
      ]);
      setOrg(orgData);
      setPeople(peopleData);
      setTeams(teamsData);
      setPolicies(policiesData);
    } catch (err) {
      setError("Failed to load organization data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-base text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-base text-muted-foreground">{error || "Organization not found."}</p>
      </div>
    );
  }

  const isAdmin = user?.organization_role === "admin";
  const currentUserId = user?.id;

  const handleEdit = () => {
    setDraft({
      name: org.name,
      short_description: org.short_description,
      address: org.address,
    });
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    try {
      const updated = await updateOrganization(draft);
      setOrg(updated);
      setEditing(false);
    } catch {
      // keep editing state on failure
    }
  };

  const yourTeams = teams.filter((team) =>
    team.members.some((m) => m.id === currentUserId),
  );
  const otherTeams = teams.filter(
    (team) => !team.members.some((m) => m.id === currentUserId),
  );

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            {editing ? (
              <div className="flex-1 space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--color-ink)]" htmlFor="org-name">
                    Name
                  </label>
                  <input
                    id="org-name"
                    aria-label="Name"
                    className="w-full rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--color-ink)]" htmlFor="org-short-description">
                    Short description
                  </label>
                  <input
                    id="org-short-description"
                    aria-label="Short description"
                    className="w-full rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                    value={draft.short_description}
                    onChange={(e) => setDraft({ ...draft, short_description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--color-ink)]" htmlFor="org-address">
                    Address
                  </label>
                  <input
                    id="org-address"
                    aria-label="Address"
                    className="w-full rounded-md border border-hairline bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                    value={draft.address}
                    onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={handleSave} aria-label="Save changes">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Save changes
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleCancel} aria-label="Cancel editing">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Cancel editing
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-[var(--color-ink)]">{org.name}</h1>
                {org.short_description && (
                  <p className="mt-2 text-base text-[var(--color-ink-muted-foreground)]">
                    {org.short_description}
                  </p>
                )}
                {org.address && (
                  <p className="mt-1 text-sm text-[var(--color-ink-muted-foreground)]">
                    {org.address}
                  </p>
                )}
              </div>
            )}
            {isAdmin && !editing && (
              <Button variant="secondary" size="sm" onClick={handleEdit} aria-label="Edit organization">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit organization
              </Button>
            )}
          </div>
        </div>

        <TabBar
          tabs={[
            { id: "people", label: "People" },
            { id: "teams", label: "Teams" },
            { id: "policies", label: "Access Policies" },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mb-6"
        />

        {activeTab === "people" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((person) => {
              const initials = getInitials({
                first_name: person.first_name,
                last_name: person.last_name,
                username: person.username,
              });
              const displayName =
                person.first_name || person.last_name
                  ? `${person.first_name} ${person.last_name}`.trim()
                  : person.username;

              return (
                <div
                  key={person.id}
                  className="flex items-center gap-3 rounded-lg border border-hairline bg-panel p-3"
                >
                  <Avatar initials={initials} color={person.color} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-[var(--color-ink)]">
                        {displayName}
                      </span>
                      {person.role === "admin" && (
                        <span className="shrink-0 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                          Admin
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--color-ink-muted-foreground)]">
                      @{person.username}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "teams" && (
          <div className="space-y-8">
            {yourTeams.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-semibold text-[var(--color-ink)]">
                  Your Teams
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {yourTeams.map((team) => renderTeamCard(team))}
                </div>
              </div>
            )}
            {otherTeams.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-semibold text-[var(--color-ink)]">
                  Other Teams
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {otherTeams.map((team) => renderTeamCard(team))}
                </div>
              </div>
            )}
            {teams.length === 0 && (
              <p className="text-sm text-[var(--color-ink-muted-foreground)]">
                No Teams have been created yet.
              </p>
            )}
          </div>
        )}

        {activeTab === "policies" && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-ink-muted-foreground)]">
              Each Core Action maps to a minimum access level based on the resource
              category. Custom Actions inherit the policy of their mapped Core Action.
            </p>
            <div className="overflow-hidden rounded-lg border border-hairline">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-hairline bg-[var(--color-panel-subtle)]">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-ink-muted-foreground)] uppercase tracking-wider">
                      Core Action
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-ink-muted-foreground)] uppercase tracking-wider">
                      Resource
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-ink-muted-foreground)] uppercase tracking-wider">
                      Required Level
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy) => (
                    <tr
                      key={policy.id}
                      className="border-b border-hairline last:border-b-0"
                    >
                      <td className="px-4 py-3 text-sm text-[var(--color-ink)]">
                        {CORE_ACTION_LABELS[policy.core_action] || policy.core_action}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--color-ink)]">
                        {policy.resource_label}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                          {LEVEL_LABELS[policy.required_level] || policy.required_level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--color-ink-muted-foreground)]">
              Organization Admins bypass all Project-level checks. The{" "}
              <code className="rounded bg-[var(--color-panel-subtle)] px-1 py-0.5 text-xs">
                read
              </code>{" "}
              Core Action is evaluated for authorization but never creates an Action
              Log Entry or appears in Activity.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function renderTeamCard(team: Team) {
  return (
    <div
      key={team.id}
      className="rounded-lg border border-hairline bg-panel p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--color-ink)]">
          {team.name}
        </span>
      </div>
      {team.members.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {team.members.map((member) => {
            const displayName =
              member.first_name || member.last_name
                ? `${member.first_name} ${member.last_name}`.trim()
                : member.username;
            return (
              <span
                key={member.id}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-panel-subtle)] px-2 py-0.5 text-xs text-[var(--color-ink)]"
              >
                <Avatar
                  initials={getInitials({
                    first_name: member.first_name,
                    last_name: member.last_name,
                    username: member.username,
                  })}
                  color={member.color}
                  size="sm"
                />
                {displayName}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-ink-muted-foreground)]">
          No members
        </p>
      )}
    </div>
  );
}
