import { get, patch } from "../../shell/src/api/client";
import type { AccessPolicy, Organization, Person } from "./types";

export function fetchOrganization(): Promise<Organization> {
  return get<Organization>("/access/organization/");
}

export function updateOrganization(
  data: Partial<Organization>,
): Promise<Organization> {
  return patch<Organization>("/access/organization/", data);
}

export function fetchPeople(): Promise<Person[]> {
  return get<Person[]>("/access/people/");
}

export function fetchPolicies(): Promise<AccessPolicy[]> {
  return get<AccessPolicy[]>("/access/policies/");
}
