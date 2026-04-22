import { OrganizationService } from '../../services/OrganizationService.js';
import { Context } from '../schema.js';

export const organizationResolvers = {
  Query: {
    organizations: async (_: unknown, __: unknown, context: Context) => {
      if (!context.userId) {
        throw new Error('Unauthorized');
      }
      return OrganizationService.getUserOrganizations(context.userId);
    },

    organization: async (_: unknown, { id }: { id: string }, context: Context) => {
      if (!context.userId) {
        throw new Error('Unauthorized');
      }

      const org = await OrganizationService.getOrganization(id);
      if (!org) {
        return null;
      }

      const hasAccess = await OrganizationService.isUserInOrganization(id, context.userId);
      if (!hasAccess) {
        throw new Error('Forbidden: You do not have access to this organization');
      }

      return org;
    },
  },

  Mutation: {
    createOrganization: async (
      _: unknown,
      { input }: { input: any },
      context: Context
    ) => {
      if (!context.userId) {
        throw new Error('Unauthorized');
      }

      return OrganizationService.createOrganization(
        context.userId,
        input.name,
        input.slug,
        input.avatar_url
      );
    },

    addOrgMember: async (
      _: unknown,
      { input }: { input: any },
      context: Context
    ) => {
      if (!context.userId) {
        throw new Error('Unauthorized');
      }

      const hasPermission = await OrganizationService.validateUserPermissions(
        input.organizationId,
        context.userId,
        'ADMIN'
      );

      if (!hasPermission) {
        throw new Error('Forbidden: You do not have permission to add members');
      }

      return OrganizationService.addOrgMember(input.organizationId, input.userId, input.role);
    },

    updateMemberRole: async (
      _: unknown,
      { input }: { input: any },
      context: Context
    ) => {
      if (!context.userId) {
        throw new Error('Unauthorized');
      }

      const hasPermission = await OrganizationService.validateUserPermissions(
        input.organizationId,
        context.userId,
        'ADMIN'
      );

      if (!hasPermission) {
        throw new Error('Forbidden: You do not have permission to update member roles');
      }

      return OrganizationService.updateMemberRole(
        input.organizationId,
        input.userId,
        input.role
      );
    },

    removeMember: async (
      _: unknown,
      { organizationId, userId }: { organizationId: string; userId: string },
      context: Context
    ) => {
      if (!context.userId) {
        throw new Error('Unauthorized');
      }

      const hasPermission = await OrganizationService.validateUserPermissions(
        organizationId,
        context.userId,
        'ADMIN'
      );

      if (!hasPermission) {
        throw new Error('Forbidden: You do not have permission to remove members');
      }

      await OrganizationService.removeMember(organizationId, userId);
      return true;
    },
  },

  Organization: {
    members: async (org: any) => {
      return OrganizationService.getOrgMembers(org.id);
    },
  },
};
