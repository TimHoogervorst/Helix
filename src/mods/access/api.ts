import { get, patch } from "../../shell/src/api/client";
import type { Organization, Person } from "./types";

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
