import { useState, useEffect, useCallback } from "react";
import { useCurrentUser } from "../../../shell/src/user/CurrentUserProvider";
import { TabBar } from "../../../shell/src/shared/primitives/TabBar";
import { Avatar, getInitials } from "../../../shell/src/user/Avatar";
import { fetchOrganization, fetchPeople } from "../api";
import type { Organization, Person } from "../types";

export default function OrganizationPage() {
  const { user } = useCurrentUser();
  const [org, setOrg] = useState<Organization | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [activeTab, setActiveTab] = useState("people");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgData, peopleData] = await Promise.all([
        fetchOrganization(),
        fetchPeople(),
      ]);
      setOrg(orgData);
      setPeople(peopleData);
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
          tabs={[{ id: "people", label: "People" }]}
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
      </div>
    </div>
  );
}
