export type TenancyLevel = "organization" | "workspace" | "team" | "project";
export type TenantStatus = "active" | "suspended" | "archived";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  description?: string;
  level: TenancyLevel;
  parentTenantId?: string;
  status: TenantStatus;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}

export interface TenantIsolationConfig {
  dataIsolation: "strict" | "shared" | "hybrid";
  resourceSharing: boolean;
  crossTenantAccess: boolean;
  customMetadata: boolean;
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  tenantLevel: TenancyLevel;
  parentTenantId?: string;
  memberRole: string;
  isolationConfig: TenantIsolationConfig;
  permissions: string[];
}

export interface TenantQuota {
  tenantId: string;
  maxUsers: number;
  maxWorkflows: number;
  maxJobs: number;
  maxStorage: number;
  maxWebhooks: number;
  storageUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_ISOLATION_CONFIG: TenantIsolationConfig = {
  dataIsolation: "strict",
  resourceSharing: false,
  crossTenantAccess: false,
  customMetadata: true,
};

export const DEFAULT_TENANT_QUOTA: Omit<
  TenantQuota,
  "tenantId" | "createdAt" | "updatedAt"
> = {
  maxUsers: 50,
  maxWorkflows: 100,
  maxJobs: 1000,
  maxStorage: 10737418240, // 10GB
  maxWebhooks: 50,
  storageUsed: 0,
};

export const TENANCY_LEVELS: Record<
  TenancyLevel,
  { order: number; parent?: TenancyLevel }
> = {
  organization: { order: 0 },
  workspace: { order: 1, parent: "organization" },
  team: { order: 2, parent: "workspace" },
  project: { order: 3, parent: "team" },
};
