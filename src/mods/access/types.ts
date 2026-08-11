export interface Organization {
  id: number;
  name: string;
  short_description: string;
  address: string;
  icon_key: string;
  color_key: string;
}

export interface Person {
  id: number;
  user: number;
  username: string;
  first_name: string;
  last_name: string;
  color: string;
  role: "user" | "admin";
  created_at: string;
}

export interface AccessPolicy {
  id: string;
  core_action: string;
  resource: string;
  resource_label: string;
  required_level: string;
}
