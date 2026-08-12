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

export interface TeamMember {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  color: string;
}

export interface Team {
  id: number;
  name: string;
  icon_key: string;
  color_key: string;
  members: TeamMember[];
  blocked_from_deletion: boolean;
}

export interface AccessPolicy {
  id: string;
  core_action: string;
  resource: string;
  resource_label: string;
  required_level: string;
}

export interface Project {
  id: number;
  uid: string;
  name: string;
  icon_key: string;
  color_key: string;
  is_archived: boolean;
  created_at: string;
  current_user_role?: "read" | "edit" | null;
}

export interface Grant {
  id: number;
  project: number;
  role: "read" | "edit";
  user: number | null;
  team: number | null;
  grantee_type: "user" | "team" | null;
  grantee_name: string | null;
}

export interface FolderShare {
  id: number;
  source_folder: number;
  source_folder_name: string;
  source_folder_path: string;
  source_project_id: number;
  source_project_name: string;
  target_project: number;
  target_project_name: string;
  level: "read" | "read_write";
}
