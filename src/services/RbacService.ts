import { query } from '../db/connection.js';
import type { Role, MemberRole, Permission, RBACContext } from '../models/Role.js';
import { PREDEFINED_ROLES, PredefinedRole } from '../models/Role.js';

export class RBACService {
  async initializeOrgRoles(orgId: string): Promise<void> {
    for (const [roleName, permissions] of Object.entries(PREDEFINED_ROLES)) {
      await this.createRole(orgId, roleName, `Predefined ${roleName} role`, permissions, true);
    }
  }

  async createRole(
    orgId: string,
    name: string,
    description: string | undefined,
    permissions: Permission[],
    isPredefined: boolean = false
  ): Promise<Role> {
    try {
      const roleResult = await query(
        `INSERT INTO roles (org_id, name, description, is_predefined)
         VALUES ($1, $2, $3, $4)
         RETURNING id, org_id, name, description, is_predefined, created_at, updated_at`,
        [orgId, name, description || null, isPredefined]
      );

      const role = roleResult.rows[0];

      if (permissions.length > 0) {
        const permissionValues = permissions.map((_, index) => `($1, $${index + 2})`).join(',');
        const permissionParams = [role.id, ...permissions];

        await query(
          `INSERT INTO role_permissions (role_id, permission)
           VALUES ${permissionValues}`,
          permissionParams
        );
      }

      return {
        id: role.id,
        orgId: role.org_id,
        name: role.name,
        description: role.description,
        permissions,
        isPredefined: role.is_predefined,
        createdAt: role.created_at,
        updatedAt: role.updated_at,
      };
    } catch (error) {
      throw new Error(`Failed to create role: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async assignRoleToMember(orgId: string, userId: string, roleId: string): Promise<MemberRole> {
    try {
      const roleCheck = await query(
        'SELECT id FROM roles WHERE id = $1 AND org_id = $2',
        [roleId, orgId]
      );

      if (roleCheck.rows.length === 0) {
        throw new Error('Role not found in this organization');
      }

      const result = await query(
        `INSERT INTO member_roles (org_id, user_id, role_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (org_id, user_id, role_id) DO NOTHING
         RETURNING id, org_id, user_id, role_id, assigned_at`,
        [orgId, userId, roleId]
      );

      if (result.rows.length === 0) {
        const existing = await query(
          'SELECT id, org_id, user_id, role_id, assigned_at FROM member_roles WHERE org_id = $1 AND user_id = $2 AND role_id = $3',
          [orgId, userId, roleId]
        );
        const row = existing.rows[0];
        return {
          id: row.id,
          orgId: row.org_id,
          userId: row.user_id,
          roleId: row.role_id,
          assignedAt: row.assigned_at,
        };
      }

      const row = result.rows[0];
      return {
        id: row.id,
        orgId: row.org_id,
        userId: row.user_id,
        roleId: row.role_id,
        assignedAt: row.assigned_at,
      };
    } catch (error) {
      throw new Error(`Failed to assign role: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async checkPermission(userId: string, orgId: string, permission: Permission): Promise<boolean> {
    try {
      const result = await query(
        `SELECT DISTINCT rp.permission FROM member_roles mr
         JOIN roles r ON mr.role_id = r.id
         JOIN role_permissions rp ON r.id = rp.role_id
         WHERE mr.user_id = $1 AND mr.org_id = $2 AND rp.permission = $3`,
        [userId, orgId, permission]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  async getUserPermissions(userId: string, orgId: string): Promise<Permission[]> {
    try {
      const result = await query(
        `SELECT DISTINCT rp.permission FROM member_roles mr
         JOIN roles r ON mr.role_id = r.id
         JOIN role_permissions rp ON r.id = rp.role_id
         WHERE mr.user_id = $1 AND mr.org_id = $2`,
        [userId, orgId]
      );

      return result.rows.map((row) => row.permission as Permission);
    } catch (error) {
      console.error('Error getting user permissions:', error);
      return [];
    }
  }

  async getUserRoles(userId: string, orgId: string): Promise<Role[]> {
    try {
      const result = await query(
        `SELECT r.id, r.org_id, r.name, r.description, r.is_predefined, r.created_at, r.updated_at
         FROM member_roles mr
         JOIN roles r ON mr.role_id = r.id
         WHERE mr.user_id = $1 AND mr.org_id = $2`,
        [userId, orgId]
      );

      const roles: Role[] = [];
      for (const roleRow of result.rows) {
        const permResult = await query(
          'SELECT permission FROM role_permissions WHERE role_id = $1',
          [roleRow.id]
        );

        roles.push({
          id: roleRow.id,
          orgId: roleRow.org_id,
          name: roleRow.name,
          description: roleRow.description,
          permissions: permResult.rows.map((row) => row.permission as Permission),
          isPredefined: roleRow.is_predefined,
          createdAt: roleRow.created_at,
          updatedAt: roleRow.updated_at,
        });
      }

      return roles;
    } catch (error) {
      console.error('Error getting user roles:', error);
      return [];
    }
  }

  async listRoles(orgId: string): Promise<Role[]> {
    try {
      const result = await query('SELECT id, org_id, name, description, is_predefined, created_at, updated_at FROM roles WHERE org_id = $1 ORDER BY name', [orgId]);

      const roles: Role[] = [];
      for (const roleRow of result.rows) {
        const permResult = await query('SELECT permission FROM role_permissions WHERE role_id = $1', [roleRow.id]);

        roles.push({
          id: roleRow.id,
          orgId: roleRow.org_id,
          name: roleRow.name,
          description: roleRow.description,
          permissions: permResult.rows.map((row) => row.permission as Permission),
          isPredefined: roleRow.is_predefined,
          createdAt: roleRow.created_at,
          updatedAt: roleRow.updated_at,
        });
      }

      return roles;
    } catch (error) {
      throw new Error(`Failed to list roles: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async updateRolePermissions(roleId: string, permissions: Permission[]): Promise<Role> {
    try {
      const roleResult = await query(
        'SELECT id, org_id, name, description, is_predefined, created_at, updated_at FROM roles WHERE id = $1',
        [roleId]
      );

      if (roleResult.rows.length === 0) {
        throw new Error('Role not found');
      }

      const roleRow = roleResult.rows[0];

      await query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

      if (permissions.length > 0) {
        const permissionValues = permissions.map((_, index) => `($1, $${index + 2})`).join(',');
        const permissionParams = [roleId, ...permissions];

        await query(
          `INSERT INTO role_permissions (role_id, permission)
           VALUES ${permissionValues}`,
          permissionParams
        );
      }

      await query('UPDATE roles SET updated_at = NOW() WHERE id = $1', [roleId]);

      return {
        id: roleRow.id,
        orgId: roleRow.org_id,
        name: roleRow.name,
        description: roleRow.description,
        permissions,
        isPredefined: roleRow.is_predefined,
        createdAt: roleRow.created_at,
        updatedAt: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to update role permissions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteRole(roleId: string): Promise<void> {
    try {
      const roleResult = await query('SELECT is_predefined FROM roles WHERE id = $1', [roleId]);

      if (roleResult.rows.length === 0) {
        throw new Error('Role not found');
      }

      if (roleResult.rows[0].is_predefined) {
        throw new Error('Cannot delete predefined roles');
      }

      await query('DELETE FROM roles WHERE id = $1', [roleId]);
    } catch (error) {
      throw new Error(`Failed to delete role: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async removeRoleFromMember(orgId: string, userId: string, roleId: string): Promise<void> {
    try {
      await query('DELETE FROM member_roles WHERE org_id = $1 AND user_id = $2 AND role_id = $3', [orgId, userId, roleId]);
    } catch (error) {
      throw new Error(`Failed to remove role: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getRBACContext(userId: string, orgId: string): Promise<RBACContext> {
    try {
      const permissions = await this.getUserPermissions(userId, orgId);
      const roles = await this.getUserRoles(userId, orgId);

      return {
        userId,
        orgId,
        permissions,
        roles,
      };
    } catch (error) {
      console.error('Error getting RBAC context:', error);
      return {
        userId,
        orgId,
        permissions: [],
        roles: [],
      };
    }
  }
}

export const rbacService = new RBACService();