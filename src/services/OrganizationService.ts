import { query } from "../db/connection.js";
import {
  Organization,
  OrgMember,
  OrgRole,
  OrgMemberWithUser,
} from "../models/Organization.js";

export class OrganizationServiceImpl {
  async createOrganization(
    userId: string,
    name: string,
    slug: string,
    avatar_url?: string,
  ): Promise<Organization> {
    const result = await query(
      `INSERT INTO organizations (name, slug, owner_id, avatar_url, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, name, description, slug, owner_id, avatar_url, created_at`,
      [name, slug, userId, avatar_url || null],
    );

    const orgId = result.rows[0].id;

    await query(
      `INSERT INTO org_members (org_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, NOW())`,
      [orgId, userId, "OWNER"],
    );

    return result.rows[0];
  }

  async addOrgMember(
    orgId: string,
    userId: string,
    role: OrgRole,
  ): Promise<OrgMember> {
    const existingMember = await query(
      `SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2`,
      [orgId, userId],
    );

    if (existingMember.rows.length > 0) {
      throw new Error("User is already a member of this organization");
    }

    const result = await query(
      `INSERT INTO org_members (org_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, org_id, user_id, role, joined_at`,
      [orgId, userId, role],
    );

    return result.rows[0];
  }

  async removeMember(orgId: string, userId: string): Promise<void> {
    const ownerCount = await query(
      `SELECT COUNT(*) FROM org_members WHERE org_id = $1 AND role = 'OWNER'`,
      [orgId],
    );

    const isRemovingOwner = await query(
      `SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
      [orgId, userId],
    );

    if (
      isRemovingOwner.rows[0]?.role === "OWNER" &&
      parseInt(ownerCount.rows[0].count) === 1
    ) {
      throw new Error("Cannot remove the only owner from an organization");
    }

    await query(`DELETE FROM org_members WHERE org_id = $1 AND user_id = $2`, [
      orgId,
      userId,
    ]);
  }

  async updateMemberRole(
    orgId: string,
    userId: string,
    role: OrgRole,
  ): Promise<OrgMember> {
    const result = await query(
      `UPDATE org_members SET role = $1
       WHERE org_id = $2 AND user_id = $3
       RETURNING id, org_id, user_id, role, joined_at`,
      [role, orgId, userId],
    );

    if (result.rows.length === 0) {
      throw new Error("Member not found");
    }

    return result.rows[0];
  }

  async transferOwnership(
    orgId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<void> {
    const toUserRole = await query(
      `SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
      [orgId, toUserId],
    );

    if (toUserRole.rows.length === 0) {
      throw new Error("User is not a member of this organization");
    }

    await query("BEGIN", []);

    try {
      await query(
        `UPDATE org_members SET role = 'ADMIN'
         WHERE org_id = $1 AND user_id = $2`,
        [orgId, fromUserId],
      );

      await query(
        `UPDATE org_members SET role = 'OWNER'
         WHERE org_id = $1 AND user_id = $2`,
        [orgId, toUserId],
      );

      await query("COMMIT", []);
    } catch (error) {
      await query("ROLLBACK", []);
      throw error;
    }
  }

  async validateUserPermissions(
    orgId: string,
    userId: string,
    requiredRole: OrgRole,
  ): Promise<boolean> {
    const result = await query(
      `SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
      [orgId, userId],
    );

    if (result.rows.length === 0) {
      return false;
    }

    const hierarchy: Record<OrgRole, number> = {
      VIEWER: 0,
      EDITOR: 1,
      ADMIN: 2,
      OWNER: 3,
    };

    const userRole = result.rows[0].role as OrgRole;
    return hierarchy[userRole] >= hierarchy[requiredRole];
  }

  async getOrgMembers(orgId: string): Promise<OrgMemberWithUser[]> {
    const result = await query(
      `SELECT om.id, om.org_id, om.user_id, om.role, om.joined_at,
              u.id as user_id, u.email, u.name, u.avatar_url,
              u.created_at, u.updated_at
       FROM org_members om
       JOIN users u ON om.user_id = u.id
       WHERE om.org_id = $1
       ORDER BY om.joined_at ASC`,
      [orgId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      org_id: row.org_id,
      user_id: row.user_id,
      role: row.role,
      joined_at: row.joined_at,
      user: {
        id: row.user_id,
        email: row.email,
        name: row.name,
        avatar_url: row.avatar_url,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    }));
  }

  async getOrganization(orgId: string): Promise<Organization | null> {
    const result = await query(
      `SELECT id, name, description, slug, owner_id, avatar_url, created_at
       FROM organizations WHERE id = $1`,
      [orgId],
    );

    return result.rows[0] || null;
  }

  async getUserOrganizations(userId: string): Promise<Organization[]> {
    const result = await query(
      `SELECT DISTINCT o.id, o.name, o.description, o.slug, o.owner_id, o.avatar_url, o.created_at
       FROM organizations o
       JOIN org_members om ON o.id = om.org_id
       WHERE om.user_id = $1
       ORDER BY o.created_at DESC`,
      [userId],
    );

    return result.rows;
  }

  async getOrganizationsBySlug(slug: string): Promise<Organization[]> {
    const result = await query(
      `SELECT id, name, description, slug, owner_id, avatar_url, created_at
       FROM organizations WHERE slug = $1`,
      [slug],
    );

    return result.rows;
  }

  async updateOrganization(
    orgId: string,
    updates: Partial<Organization>,
  ): Promise<Organization> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }
    if (updates.avatar_url !== undefined) {
      fields.push(`avatar_url = $${paramCount++}`);
      values.push(updates.avatar_url);
    }

    if (fields.length === 0) {
      return (await this.getOrganization(orgId))!;
    }

    values.push(orgId);

    const result = await query(
      `UPDATE organizations SET ${fields.join(", ")}
       WHERE id = $${paramCount}
       RETURNING id, name, description, slug, owner_id, avatar_url, created_at`,
      values,
    );

    return result.rows[0];
  }

  async deleteOrganization(orgId: string): Promise<void> {
    await query("BEGIN", []);

    try {
      await query(`DELETE FROM org_members WHERE org_id = $1`, [orgId]);
      await query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
      await query("COMMIT", []);
    } catch (error) {
      await query("ROLLBACK", []);
      throw error;
    }
  }

  async getMembersByRole(
    orgId: string,
    role: OrgRole,
  ): Promise<OrgMemberWithUser[]> {
    const result = await query(
      `SELECT om.id, om.org_id, om.user_id, om.role, om.joined_at,
              u.id as user_id, u.email, u.name, u.avatar_url,
              u.created_at, u.updated_at
       FROM org_members om
       JOIN users u ON om.user_id = u.id
       WHERE om.org_id = $1 AND om.role = $2
       ORDER BY om.joined_at ASC`,
      [orgId, role],
    );

    return result.rows.map((row) => ({
      id: row.id,
      org_id: row.org_id,
      user_id: row.user_id,
      role: row.role,
      joined_at: row.joined_at,
      user: {
        id: row.user_id,
        email: row.email,
        name: row.name,
        avatar_url: row.avatar_url,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    }));
  }

  async getOrganizationStats(orgId: string): Promise<{
    totalMembers: number;
    owners: number;
    admins: number;
    editors: number;
    viewers: number;
  }> {
    const result = await query(
      `SELECT role, COUNT(*) as count FROM org_members
       WHERE org_id = $1
       GROUP BY role`,
      [orgId],
    );

    const stats = {
      totalMembers: 0,
      owners: 0,
      admins: 0,
      editors: 0,
      viewers: 0,
    };

    for (const row of result.rows) {
      const count = parseInt(row.count);
      stats.totalMembers += count;
      stats[row.role.toLowerCase() as keyof typeof stats] = count;
    }

    return stats;
  }

  async isUserInOrganization(orgId: string, userId: string): Promise<boolean> {
    const result = await query(
      `SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2`,
      [orgId, userId],
    );

    return result.rows.length > 0;
  }
}

export const OrganizationService = new OrganizationServiceImpl();
