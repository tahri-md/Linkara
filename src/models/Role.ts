export enum Permission {
  // Organization Management
  ORG_READ = 'org:read',
  ORG_UPDATE = 'org:update',
  ORG_DELETE = 'org:delete',
  ORG_INVITE_MEMBER = 'org:invite_member',
  ORG_REMOVE_MEMBER = 'org:remove_member',

  // Workflow Management
  WORKFLOW_CREATE = 'workflow:create',
  WORKFLOW_READ = 'workflow:read',
  WORKFLOW_UPDATE = 'workflow:update',
  WORKFLOW_DELETE = 'workflow:delete',
  WORKFLOW_EXECUTE = 'workflow:execute',

  // Job Management
  JOB_CREATE = 'job:create',
  JOB_READ = 'job:read',
  JOB_UPDATE = 'job:update',
  JOB_DELETE = 'job:delete',
  JOB_CANCEL = 'job:cancel',
  JOB_RETRY = 'job:retry',

  // Member Management
  MEMBER_INVITE = 'member:invite',
  MEMBER_REMOVE = 'member:remove',
  MEMBER_UPDATE = 'member:update',
  MEMBER_ASSIGN_ROLE = 'member:assign_role',

  // Settings
  SETTINGS_READ = 'settings:read',
  SETTINGS_UPDATE = 'settings:update',

  // Webhook Management
  WEBHOOK_CREATE = 'webhook:create',
  WEBHOOK_READ = 'webhook:read',
  WEBHOOK_UPDATE = 'webhook:update',
  WEBHOOK_DELETE = 'webhook:delete',

  // Secrets Management
  SECRETS_CREATE = 'secrets:create',
  SECRETS_READ = 'secrets:read',
  SECRETS_UPDATE = 'secrets:update',
  SECRETS_DELETE = 'secrets:delete',
}

export enum PredefinedRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export interface Role {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  permissions: Permission[];
  isPredefined: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberRole {
  id: string;
  orgId: string;
  userId: string;
  roleId: string;
  assignedAt: Date;
}

export interface RBACContext {
  userId: string;
  orgId: string;
  permissions: Permission[];
  roles: Role[];
}

// Predefined role permissions
export const PREDEFINED_ROLES: Record<PredefinedRole, Permission[]> = {
  [PredefinedRole.ADMIN]: [
    // All permissions
    ...Object.values(Permission),
  ],
  [PredefinedRole.EDITOR]: [
    // Can manage workflows, jobs, and webhooks
    Permission.ORG_READ,
    Permission.WORKFLOW_CREATE,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_UPDATE,
    Permission.WORKFLOW_DELETE,
    Permission.WORKFLOW_EXECUTE,
    Permission.JOB_CREATE,
    Permission.JOB_READ,
    Permission.JOB_UPDATE,
    Permission.JOB_DELETE,
    Permission.JOB_CANCEL,
    Permission.JOB_RETRY,
    Permission.WEBHOOK_CREATE,
    Permission.WEBHOOK_READ,
    Permission.WEBHOOK_UPDATE,
    Permission.WEBHOOK_DELETE,
    Permission.SECRETS_READ,
    Permission.SETTINGS_READ,
  ],
  [PredefinedRole.VIEWER]: [
    // Can only read
    Permission.ORG_READ,
    Permission.WORKFLOW_READ,
    Permission.JOB_READ,
    Permission.WEBHOOK_READ,
    Permission.SETTINGS_READ,
  ],
};
