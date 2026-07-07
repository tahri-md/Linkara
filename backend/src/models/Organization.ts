import { UserPublic } from "./User.js";

export type OrgRole = "ADMIN" | "OWNER" | "EDITOR" | "VIEWER";

export interface Organization {
  id: string;
  name: string;
  description?: string;
  slug: string;
  owner_id: string;
  avatar_url?: string;
  created_at: Date;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  joined_at: Date;
}

export interface OrgMemberWithUser extends OrgMember {
  user: UserPublic;
}

export interface OrganizationInput {
  name: string;
  description?: string;
  slug: string;
  avatar_url?: string;
}

export interface AddMemberInput {
  organizationId: string;
  userId: string;
  role: OrgRole;
}

export interface UpdateMemberRoleInput {
  organizationId: string;
  userId: string;
  role: OrgRole;
}
