import { tenancyService } from '../../services/TenancyService.js';
import type { TenancyLevel, Tenant } from '../../models/Tenancy.js';

type QuotaResource = 'storage' | 'workflows' | 'jobs' | 'webhooks' | 'users';

interface GraphQLContext {
  userId: string | null;
}

interface CreateTenantInput {
  name: string;
  slug: string;
  level: TenancyLevel;
  parentTenantId?: string;
  description?: string;
  metadata?: string;
}

interface AddTenantMemberInput {
  userId: string;
  role: string;
}

interface IsolationConfigInput {
  [key: string]: unknown;
}

export const tenancyResolvers = {
  Query: {
    async tenant(_: unknown, { id }: { id: string }, context: GraphQLContext) {
      if (!context.userId) throw new Error('Unauthorized');
      return tenancyService.getTenant(id);
    },

    async tenantBySlug(_: unknown, { slug }: { slug: string }, context: GraphQLContext) {
      if (!context.userId) throw new Error('Unauthorized');
      return tenancyService.getTenantBySlug(slug);
    },

    async childTenants(
      _: unknown,
      { parentId, level }: { parentId: string; level?: TenancyLevel },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const parent = await tenancyService.getTenant(parentId);
      if (!parent) throw new Error('Parent tenant not found');

      const isMember = await tenancyService.isTenantMember(parentId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of parent tenant');

      return tenancyService.getChildTenants(parentId, level);
    },

    async myTenants(
      _: unknown,
      { level }: { level?: TenancyLevel },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');
      return tenancyService.getUserTenants(context.userId, level);
    },

    async tenantMembers(
      _: unknown,
      { tenantId }: { tenantId: string },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const isMember = await tenancyService.isTenantMember(tenantId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of this tenant');

      return tenancyService.getTenantMembers(tenantId);
    },

    async tenantIsolationConfig(
      _: unknown,
      { tenantId }: { tenantId: string },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const isMember = await tenancyService.isTenantMember(tenantId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of this tenant');

      return tenancyService.getIsolationConfig(tenantId);
    },

    async tenantQuota(
      _: unknown,
      { tenantId }: { tenantId: string },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const isMember = await tenancyService.isTenantMember(tenantId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of this tenant');

      return tenancyService.getTenantQuota(tenantId);
    },

    async checkQuota(
      _: unknown,
      { tenantId, resource, amount }: { tenantId: string; resource: string; amount?: number },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const isMember = await tenancyService.isTenantMember(tenantId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of this tenant');

      const quota = await tenancyService.getTenantQuota(tenantId);
      if (!quota) throw new Error('Quota not found');

      const available = await tenancyService.checkQuota(tenantId, resource, amount ?? 1);

      let current = 0;
      let limit = 0;

      const normalizedResource = resource.toLowerCase() as QuotaResource;

      switch (normalizedResource) {
        case 'storage':
          current = quota.storageUsed;
          limit = quota.maxStorage;
          break;
        case 'workflows':
          current = await tenancyService.getResourceCount(tenantId, 'workflows');
          limit = quota.maxWorkflows;
          break;
        case 'jobs':
          current = await tenancyService.getResourceCount(tenantId, 'jobs');
          limit = quota.maxJobs;
          break;
        case 'webhooks':
          current = await tenancyService.getResourceCount(tenantId, 'webhooks');
          limit = quota.maxWebhooks;
          break;
        case 'users': {
          const members = await tenancyService.getTenantMembers(tenantId);
          current = members.length;
          limit = quota.maxUsers;
          break;
        }
      }

      return { available, current, limit };
    },

    async tenantContext(
      _: unknown,
      { tenantId }: { tenantId: string },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');
      return tenancyService.buildTenantContext(tenantId, context.userId);
    },
  },

  Mutation: {
    async createTenant(
      _: unknown,
      { input }: { input: CreateTenantInput },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const { name, slug, level, parentTenantId, description, metadata } = input;

      const tenant = await tenancyService.createTenant(
        name,
        slug,
        level,
        parentTenantId,
        description,
        metadata ? JSON.parse(metadata) : undefined
      );

      await tenancyService.addTenantMember(tenant.id, context.userId, 'admin');

      return tenant;
    },

    async addTenantMember(
      _: unknown,
      { tenantId, input }: { tenantId: string; input: AddTenantMemberInput },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const isMember = await tenancyService.isTenantMember(tenantId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of this tenant');

      const { userId, role } = input;
      return tenancyService.addTenantMember(tenantId, userId, role);
    },

    async removeTenantMember(
      _: unknown,
      { tenantId, userId }: { tenantId: string; userId: string },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const isMember = await tenancyService.isTenantMember(tenantId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of this tenant');

      const success = await tenancyService.removeTenantMember(tenantId, userId);
      return {
        success,
        message: success ? 'Member removed successfully' : 'Member not found',
      };
    },

    async updateTenantIsolationConfig(
      _: unknown,
      { tenantId, input }: { tenantId: string; input: IsolationConfigInput },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const isMember = await tenancyService.isTenantMember(tenantId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of this tenant');

      return tenancyService.updateIsolationConfig(tenantId, input);
    },

    async suspendTenant(
      _: unknown,
      { tenantId }: { tenantId: string },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const isMember = await tenancyService.isTenantMember(tenantId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of this tenant');

      return tenancyService.suspendTenant(tenantId);
    },

    async archiveTenant(
      _: unknown,
      { tenantId }: { tenantId: string },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const isMember = await tenancyService.isTenantMember(tenantId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of this tenant');

      return tenancyService.archiveTenant(tenantId);
    },

    async activateTenant(
      _: unknown,
      { tenantId }: { tenantId: string },
      context: GraphQLContext
    ) {
      if (!context.userId) throw new Error('Unauthorized');

      const isMember = await tenancyService.isTenantMember(tenantId, context.userId);
      if (!isMember) throw new Error('Unauthorized: Not a member of this tenant');

      return tenancyService.activateTenant(tenantId);
    },
  },
};