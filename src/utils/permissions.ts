import { OrgRole } from "../models/Organization.js";

type Permission =
  | "manage_members"
  | "edit_org"
  | "delete_org"
  | "create_workflow"
  | "read_org";

const rolePermissions: Record<OrgRole, Permission[]> = {
  OWNER: [
    "manage_members",
    "edit_org",
    "delete_org",
    "create_workflow",
    "read_org",
  ],
  ADMIN: ["manage_members", "edit_org", "create_workflow", "read_org"],
  EDITOR: ["create_workflow", "read_org"],
  VIEWER: ["read_org"],
};

export const hasPermission = (
  role: OrgRole,
  permission: Permission,
): boolean => {
  return rolePermissions[role]?.includes(permission) ?? false;
};

export const canManageOrg = (role: OrgRole): boolean =>
  hasPermission(role, "manage_members");
export const canEditOrg = (role: OrgRole): boolean =>
  hasPermission(role, "edit_org");
export const canDeleteOrg = (role: OrgRole): boolean =>
  hasPermission(role, "delete_org");
export const canCreateWorkflow = (role: OrgRole): boolean =>
  hasPermission(role, "create_workflow");

export const getHigherRole = (role1: OrgRole, role2: OrgRole): OrgRole => {
  const hierarchy: Record<OrgRole, number> = {
    VIEWER: 0,
    EDITOR: 1,
    ADMIN: 2,
    OWNER: 3,
  };
  return hierarchy[role1] > hierarchy[role2] ? role1 : role2;
};
