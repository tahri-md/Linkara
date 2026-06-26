import { query } from "../db/connection.js";
import type {
  Tenant,
  TenantMember,
  TenantIsolationConfig,
  TenantContext,
  TenantQuota,
  TenancyLevel,
  TenantStatus,
} from "../models/Tenancy.js";
import {
  DEFAULT_ISOLATION_CONFIG,
  DEFAULT_TENANT_QUOTA,
  TENANCY_LEVELS,
} from "../models/Tenancy.js";
import { randomUUID } from "crypto";

class TenancyServiceImpl {
  async createTenant(
    name: string,
    slug: string,
    level: TenancyLevel,
    parentTenantId?: string,
    description?: string,
    metadata?: Record<string, any>,
  ): Promise<Tenant> {
    console.log(`[tenancy] Creating tenant: ${name} (level: ${level})`);

    if (level !== "organization" && !parentTenantId) {
      throw new Error(`Tenant level "${level}" requires a parent tenant`);
    }

    if (parentTenantId) {
      const parent = await this.getTenant(parentTenantId);
      if (!parent)
        throw new Error(`Parent tenant not found: ${parentTenantId}`);

      const parentLevel = TENANCY_LEVELS[parent.level];
      const currentLevel = TENANCY_LEVELS[level];

      if (currentLevel.parent !== parent.level) {
        throw new Error(`Cannot create ${level} under ${parent.level}`);
      }
    }

    const tenantId = randomUUID();
    const now = new Date();

    try {
      await query(
        `INSERT INTO tenants (id, name, slug, level, parent_tenant_id, description, metadata, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tenantId,
          name,
          slug,
          level,
          parentTenantId || null,
          description || null,
          JSON.stringify(metadata || {}),
          "active",
          now,
          now,
        ],
      );

      await query(
        `INSERT INTO tenant_isolation_configs (tenant_id, data_isolation, resource_sharing, cross_tenant_access, custom_metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          DEFAULT_ISOLATION_CONFIG.dataIsolation,
          DEFAULT_ISOLATION_CONFIG.resourceSharing,
          DEFAULT_ISOLATION_CONFIG.crossTenantAccess,
          DEFAULT_ISOLATION_CONFIG.customMetadata,
          now,
        ],
      );

      await query(
        `INSERT INTO tenant_quotas (tenant_id, max_users, max_workflows, max_jobs, max_storage, max_webhooks, storage_used, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tenantId,
          DEFAULT_TENANT_QUOTA.maxUsers,
          DEFAULT_TENANT_QUOTA.maxWorkflows,
          DEFAULT_TENANT_QUOTA.maxJobs,
          DEFAULT_TENANT_QUOTA.maxStorage,
          DEFAULT_TENANT_QUOTA.maxWebhooks,
          0,
          now,
          now,
        ],
      );

      console.log(`[tenancy] Tenant created: ${tenantId}`);
      return this.getTenant(tenantId) as Promise<Tenant>;
    } catch (err) {
      console.error(`[tenancy] Error creating tenant:`, err);
      throw err;
    }
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    try {
      const result = await query("SELECT * FROM tenants WHERE id = $1", [
        tenantId,
      ]);
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        level: row.level,
        parentTenantId: row.parent_tenant_id,
        status: row.status,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (err) {
      console.error(`[tenancy] Error fetching tenant:`, err);
      throw err;
    }
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    try {
      const result = await query("SELECT * FROM tenants WHERE slug = $1", [
        slug,
      ]);
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        level: row.level,
        parentTenantId: row.parent_tenant_id,
        status: row.status,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (err) {
      console.error(`[tenancy] Error fetching tenant by slug:`, err);
      throw err;
    }
  }

  async getChildTenants(
    parentTenantId: string,
    level?: TenancyLevel,
  ): Promise<Tenant[]> {
    try {
      let sql = "SELECT * FROM tenants WHERE parent_tenant_id = $1";
      const params: any[] = [parentTenantId];

      if (level) {
        sql += " AND level = $2";
        params.push(level);
      }

      sql += " ORDER BY created_at DESC";

      const result = await query(sql, params);
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        level: row.level,
        parentTenantId: row.parent_tenant_id,
        status: row.status,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      console.error(`[tenancy] Error fetching child tenants:`, err);
      throw err;
    }
  }

  async addTenantMember(
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<TenantMember> {
    console.log(
      `[tenancy] Adding member ${userId} to tenant ${tenantId} with role ${role}`,
    );

    const memberId = randomUUID();
    const now = new Date();

    try {
      await query(
        `INSERT INTO tenant_members (id, tenant_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [memberId, tenantId, userId, role, now],
      );

      return {
        id: memberId,
        tenantId,
        userId,
        role,
        joinedAt: now,
      };
    } catch (err) {
      console.error(`[tenancy] Error adding tenant member:`, err);
      throw err;
    }
  }

  async removeTenantMember(tenantId: string, userId: string): Promise<boolean> {
    console.log(`[tenancy] Removing member ${userId} from tenant ${tenantId}`);

    try {
      const result = await query(
        "DELETE FROM tenant_members WHERE tenant_id = $1 AND user_id = $2",
        [tenantId, userId],
      );
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      console.error(`[tenancy] Error removing tenant member:`, err);
      throw err;
    }
  }

  async getTenantMembers(tenantId: string): Promise<TenantMember[]> {
    try {
      const result = await query(
        `SELECT id, tenant_id, user_id, role, joined_at FROM tenant_members WHERE tenant_id = $1 ORDER BY joined_at DESC`,
        [tenantId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id,
        role: row.role,
        joinedAt: row.joined_at,
      }));
    } catch (err) {
      console.error(`[tenancy] Error fetching tenant members:`, err);
      throw err;
    }
  }

  async isTenantMember(tenantId: string, userId: string): Promise<boolean> {
    try {
      const result = await query(
        `SELECT id FROM tenant_members WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
        [tenantId, userId],
      );
      return result.rows.length > 0;
    } catch (err) {
      console.error(`[tenancy] Error checking tenant membership:`, err);
      throw err;
    }
  }

  async getUserTenants(
    userId: string,
    level?: TenancyLevel,
  ): Promise<Tenant[]> {
    try {
      let sql = `SELECT DISTINCT t.* FROM tenants t 
                 INNER JOIN tenant_members tm ON t.id = tm.tenant_id 
                 WHERE tm.user_id = $1`;
      const params: any[] = [userId];

      if (level) {
        sql += " AND t.level = $2";
        params.push(level);
      }

      sql += " ORDER BY t.created_at DESC";

      const result = await query(sql, params);
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        level: row.level,
        parentTenantId: row.parent_tenant_id,
        status: row.status,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      console.error(`[tenancy] Error fetching user tenants:`, err);
      throw err;
    }
  }

  async getIsolationConfig(
    tenantId: string,
  ): Promise<TenantIsolationConfig | null> {
    try {
      const result = await query(
        "SELECT * FROM tenant_isolation_configs WHERE tenant_id = $1",
        [tenantId],
      );
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        dataIsolation: row.data_isolation,
        resourceSharing: row.resource_sharing,
        crossTenantAccess: row.cross_tenant_access,
        customMetadata: row.custom_metadata,
      };
    } catch (err) {
      console.error(`[tenancy] Error fetching isolation config:`, err);
      throw err;
    }
  }

  async updateIsolationConfig(
    tenantId: string,
    config: Partial<TenantIsolationConfig>,
  ): Promise<TenantIsolationConfig> {
    console.log(`[tenancy] Updating isolation config for tenant ${tenantId}`);

    try {
      const updates: string[] = [];
      const values: any[] = [tenantId];
      let paramIndex = 2;

      if (config.dataIsolation !== undefined) {
        updates.push(`data_isolation = $${paramIndex++}`);
        values.push(config.dataIsolation);
      }
      if (config.resourceSharing !== undefined) {
        updates.push(`resource_sharing = $${paramIndex++}`);
        values.push(config.resourceSharing);
      }
      if (config.crossTenantAccess !== undefined) {
        updates.push(`cross_tenant_access = $${paramIndex++}`);
        values.push(config.crossTenantAccess);
      }
      if (config.customMetadata !== undefined) {
        updates.push(`custom_metadata = $${paramIndex++}`);
        values.push(config.customMetadata);
      }

      if (updates.length === 0) {
        return (await this.getIsolationConfig(
          tenantId,
        )) as TenantIsolationConfig;
      }

      await query(
        `UPDATE tenant_isolation_configs SET ${updates.join(", ")} WHERE tenant_id = $1`,
        values,
      );

      return (await this.getIsolationConfig(tenantId)) as TenantIsolationConfig;
    } catch (err) {
      console.error(`[tenancy] Error updating isolation config:`, err);
      throw err;
    }
  }

  async getTenantQuota(tenantId: string): Promise<TenantQuota | null> {
    try {
      const result = await query(
        "SELECT * FROM tenant_quotas WHERE tenant_id = $1",
        [tenantId],
      );
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        tenantId: row.tenant_id,
        maxUsers: row.max_users,
        maxWorkflows: row.max_workflows,
        maxJobs: row.max_jobs,
        maxStorage: row.max_storage,
        maxWebhooks: row.max_webhooks,
        storageUsed: row.storage_used,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (err) {
      console.error(`[tenancy] Error fetching tenant quota:`, err);
      throw err;
    }
  }

  async checkQuota(
    tenantId: string,
    resource: string,
    amount: number = 1,
  ): Promise<boolean> {
    try {
      const quota = await this.getTenantQuota(tenantId);
      if (!quota) return false;

      switch (resource.toLowerCase()) {
        case "storage":
          return quota.storageUsed + amount <= quota.maxStorage;
        case "workflows": {
          const workflowCount = await this.getResourceCount(
            tenantId,
            "workflows",
          );
          return workflowCount + amount <= quota.maxWorkflows;
        }
        case "jobs": {
          const jobCount = await this.getResourceCount(tenantId, "jobs");
          return jobCount + amount <= quota.maxJobs;
        }
        case "webhooks": {
          const webhookCount = await this.getResourceCount(
            tenantId,
            "webhooks",
          );
          return webhookCount + amount <= quota.maxWebhooks;
        }
        case "users": {
          const members = await this.getTenantMembers(tenantId);
          return members.length + amount <= quota.maxUsers;
        }
        default:
          return false;
      }
    } catch (err) {
      console.error(`[tenancy] Error checking quota:`, err);
      throw err;
    }
  }

  async getResourceCount(tenantId: string, resource: string): Promise<number> {
    try {
      let table: string;
      let tenantColumn: string;

      switch (resource) {
        case "workflows":
          table = "workflows";
          tenantColumn = "org_id";
          break;
        case "jobs":
          table = "jobs";
          tenantColumn = "org_id";
          break;
        case "webhooks":
          table = "webhooks";
          tenantColumn = "org_id";
          break;
        default:
          return 0;
      }

      const result = await query(
        `SELECT COUNT(*) as count FROM ${table} WHERE ${tenantColumn} = $1`,
        [tenantId],
      );
      return parseInt(result.rows[0].count, 10);
    } catch (err) {
      console.error(`[tenancy] Error counting resources:`, err);
      return 0;
    }
  }

  async buildTenantContext(
    tenantId: string,
    userId: string,
  ): Promise<TenantContext> {
    try {
      const tenant = await this.getTenant(tenantId);
      if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

      const isMember = await this.isTenantMember(tenantId, userId);
      if (!isMember)
        throw new Error(`User is not member of tenant: ${tenantId}`);

      const isolationConfig = await this.getIsolationConfig(tenantId);
      if (!isolationConfig)
        throw new Error(`Isolation config not found for tenant: ${tenantId}`);

      const result = await query(
        "SELECT role FROM tenant_members WHERE tenant_id = $1 AND user_id = $2",
        [tenantId, userId],
      );
      const memberRole = result.rows[0]?.role || "member";

      return {
        tenantId,
        userId,
        tenantLevel: tenant.level,
        parentTenantId: tenant.parentTenantId,
        memberRole,
        isolationConfig,
        permissions: [],
      };
    } catch (err) {
      console.error(`[tenancy] Error building tenant context:`, err);
      throw err;
    }
  }

  async suspendTenant(tenantId: string): Promise<Tenant> {
    return this.setTenantStatus(tenantId, "suspended");
  }

  async archiveTenant(tenantId: string): Promise<Tenant> {
    return this.setTenantStatus(tenantId, "archived");
  }

  async activateTenant(tenantId: string): Promise<Tenant> {
    return this.setTenantStatus(tenantId, "active");
  }

  private async setTenantStatus(
    tenantId: string,
    status: TenantStatus,
  ): Promise<Tenant> {
    console.log(`[tenancy] Setting tenant ${tenantId} status to ${status}`);

    try {
      const now = new Date();
      await query(
        "UPDATE tenants SET status = $1, updated_at = $2 WHERE id = $3",
        [status, now, tenantId],
      );
      return (await this.getTenant(tenantId)) as Tenant;
    } catch (err) {
      console.error(`[tenancy] Error setting tenant status:`, err);
      throw err;
    }
  }
}

export const tenancyService = new TenancyServiceImpl();
