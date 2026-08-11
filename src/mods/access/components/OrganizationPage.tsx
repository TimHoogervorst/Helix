import { useState, useEffect, useCallback } from "react";
import { useCurrentUser } from "../../../shell/src/user/CurrentUserProvider";
import { TabBar } from "../../../shell/src/shared/primitives/TabBar";
import { Avatar, getInitials } from "../../../shell/src/user/Avatar";
import { fetchOrganization, fetchPeople, fetchPolicies } from "../api";
import type { AccessPolicy, Organization, Person } from "../types";

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
  const [policies, setPolicies] = useState<AccessPolicy[]>([]);
  const [activeTab, setActiveTab] = useState("people");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgData, peopleData, policiesData] = await Promise.all([
        fetchOrganization(),
        fetchPeople(),
        fetchPolicies(),
      ]);
      setOrg(orgData);
      setPeople(peopleData);
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

  const isAdmin = user != null && people.some(
    (p) => p.user === user.id && p.role === "admin"
  );

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="mb-8">
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

        <TabBar
          tabs={[
            { id: "people", label: "People" },
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
