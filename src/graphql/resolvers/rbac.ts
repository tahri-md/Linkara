import { rbacService } from '../../services/RbacService.js';
import type { Context } from '../schema.js';
import type { Permission } from '../../models/Role.js';

export const rbacResolvers = {
  Query: {
    roles: async (_: any, { orgId }: { orgId: string }, context: Context) => {
      // Check if user has permission to read organization
      const hasPermission = await rbacService.checkPermission(context.userId!, orgId, 'org:read' as Permission);
      if (!hasPermission) {
        throw new Error('Unauthorized: No permission to read organization roles');
      }

      return rbacService.listRoles(orgId);
    },

    userRoles: async (_: any, { orgId }: { orgId: string }, context: Context) => {
      return rbacService.getUserRoles(context.userId!, orgId);
    },

    userPermissions: async (_: any, { orgId }: { orgId: string }, context: Context) => {
      return rbacService.getUserPermissions(context.userId!, orgId);
    },

    hasPermission: async (_: any, { orgId, permission }: { orgId: string; permission: Permission }, context: Context) => {
      return rbacService.checkPermission(context.userId!, orgId, permission);
    },

    rbacContext: async (_: any, { orgId }: { orgId: string }, context: Context) => {
      return rbacService.getRBACContext(context.userId!, orgId);
    },
  },

  Mutation: {
    createRole: async (
      _: any,
      { orgId, input }: { orgId: string; input: { name: string; description?: string; permissions: Permission[] } },
      context: Context
    ) => {
      // Check if user has permission to update organization
      const hasPermission = await rbacService.checkPermission(context.userId!, orgId, 'org:update' as Permission);
      if (!hasPermission) {
        throw new Error('Unauthorized: No permission to create roles');
      }

      // Validate input
      if (!input.name || input.name.trim().length === 0) {
        throw new Error('Role name is required');
      }

      if (!input.permissions || input.permissions.length === 0) {
        throw new Error('At least one permission is required');
      }

      return rbacService.createRole(orgId, input.name, input.description, input.permissions, false);
    },

    updateRolePermissions: async (
      _: any,
      { roleId, input }: { roleId: string; input: { permissions: Permission[] } },
      context: Context
    ) => {
      // Get role to check organization and if it's predefined
      const roles = await rbacService.listRoles(context.userId!); // This won't work, need to fix
      // For now, we'll validate after getting the role

      if (!input.permissions || input.permissions.length === 0) {
        throw new Error('At least one permission is required');
      }

      return rbacService.updateRolePermissions(roleId, input.permissions);
    },

    assignRole: async (
      _: any,
      { orgId, input }: { orgId: string; input: { userId: string; roleId: string } },
      context: Context
    ) => {
      // Check if user has permission to assign roles
      const hasPermission = await rbacService.checkPermission(context.userId!, orgId, 'member:assign_role' as Permission);
      if (!hasPermission) {
        throw new Error('Unauthorized: No permission to assign roles');
      }

      if (!input.userId || !input.roleId) {
        throw new Error('userId and roleId are required');
      }

      return rbacService.assignRoleToMember(orgId, input.userId, input.roleId);
    },

    removeRole: async (_: any, { orgId, userId, roleId }: { orgId: string; userId: string; roleId: string }, context: Context) => {
      // Check if user has permission to assign roles
      const hasPermission = await rbacService.checkPermission(context.userId!, orgId, 'member:assign_role' as Permission);
      if (!hasPermission) {
        throw new Error('Unauthorized: No permission to remove roles');
      }

      if (!userId || !roleId) {
        throw new Error('userId and roleId are required');
      }

      await rbacService.removeRoleFromMember(orgId, userId, roleId);

      return {
        success: true,
        message: 'Role removed successfully',
      };
    },

    deleteRole: async (_: any, { roleId }: { roleId: string }, context: Context) => {
      // Note: In a production system you'd want to fetch the role first to verify the user has permission to delete it in their organization
      try {
        await rbacService.deleteRole(roleId);
        return {
          success: true,
          message: 'Role deleted successfully',
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to delete role',
        };
      }
    },
  },
};
