import { query } from "../db/connection.js";
import { decryptSecret, encryptSecret } from "../utils/encryption.js";

export interface SecretRecord {
  id: string;
  org_id: string;
  name: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  accessed_at: Date | null;
}

export interface SecretAuditLogRecord {
  id: number;
  org_id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  changes: string | null;
  created_at: Date;
}

interface SecretRow extends SecretRecord {
  encrypted_value: string;
}

export class SecretsService {
  private getEncryptionKey(): string {
    const encryptionKey = process.env.ENCRYPTION_KEY;

    if (!encryptionKey) {
      throw new Error("ENCRYPTION_KEY is not configured");
    }

    return encryptionKey;
  }

  private validateSecretName(name: string): boolean {
    return /^[A-Za-z0-9_]{3,50}$/.test(name);
  }

  private async assertOrgOwner(orgId: string, userId: string): Promise<void> {
    const orgResult = await query(
      `SELECT id, owner_id
             FROM organizations
             WHERE id = $1`,
      [orgId],
    );

    if (orgResult.rows.length === 0) {
      throw new Error("Organization not found");
    }

    const org = orgResult.rows[0];
    if (org.owner_id === userId) {
      return;
    }

    const membershipResult = await query(
      `SELECT role
             FROM org_members
             WHERE org_id = $1 AND user_id = $2
             LIMIT 1`,
      [orgId, userId],
    );

    if (membershipResult.rows.length === 0) {
      throw new Error("Permission denied");
    }

    const role = String(membershipResult.rows[0].role).toUpperCase();
    if (role !== "OWNER") {
      throw new Error("Permission denied");
    }
  }

  private async assertOrgAccess(orgId: string, userId: string): Promise<void> {
    const membershipResult = await query(
      `SELECT 1
             FROM org_members
             WHERE org_id = $1 AND user_id = $2
             LIMIT 1`,
      [orgId, userId],
    );

    if (membershipResult.rows.length === 0) {
      throw new Error("Permission denied");
    }
  }

  private formatSecret(row: SecretRecord): SecretRecord {
    return {
      id: row.id,
      org_id: row.org_id,
      name: row.name,
      created_by: row.created_by,
      created_at:
        row.created_at instanceof Date
          ? row.created_at
          : new Date(row.created_at),
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at
          : new Date(row.updated_at),
      accessed_at: row.accessed_at
        ? row.accessed_at instanceof Date
          ? row.accessed_at
          : new Date(row.accessed_at)
        : null,
    };
  }

  private formatSecretRow(row: any): SecretRecord {
    return this.formatSecret({
      id: row.id,
      org_id: row.org_id,
      name: row.name,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      accessed_at: row.accessed_at,
    });
  }

  private formatAuditRow(row: any): SecretAuditLogRecord {
    return {
      id: row.id,
      org_id: row.org_id,
      user_id: row.user_id,
      action: row.action,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      changes: row.changes ? JSON.stringify(row.changes) : null,
      created_at:
        row.created_at instanceof Date
          ? row.created_at
          : new Date(row.created_at),
    };
  }

  private async logAudit(
    orgId: string,
    userId: string | null,
    action: string,
    resourceId: string | null,
    changes: Record<string, unknown>,
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO audit_logs (org_id, user_id, action, resource_type, resource_id, changes, created_at)
                 VALUES ($1, $2, $3, 'secret', $4, $5, NOW())`,
        [orgId, userId, action, resourceId, JSON.stringify(changes)],
      );
    } catch (error) {
      console.error("[secrets] Failed to write audit log:", error);
    }
  }

  async storeSecret(
    orgId: string,
    name: string,
    plaintext: string,
    userId: string,
  ): Promise<SecretRecord> {
    await this.assertOrgOwner(orgId, userId);

    if (!this.validateSecretName(name)) {
      throw new Error("Invalid secret name");
    }

    const existing = await query(
      `SELECT id FROM secrets WHERE org_id = $1 AND name = $2 LIMIT 1`,
      [orgId, name],
    );

    if (existing.rows.length > 0) {
      throw new Error("Secret already exists");
    }

    const encryptedValue = encryptSecret(plaintext, this.getEncryptionKey());

    const result = await query(
      `INSERT INTO secrets (org_id, name, encrypted_value, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             RETURNING id, org_id, name, created_by, created_at, updated_at, accessed_at`,
      [orgId, name, encryptedValue, userId],
    );

    const secret = this.formatSecretRow(result.rows[0]);
    await this.logAudit(orgId, userId, "secret.created", secret.id, { name });
    return secret;
  }

  async getSecret(
    orgId: string,
    secretId: string,
    userId: string,
  ): Promise<string> {
    await this.assertOrgOwner(orgId, userId);

    const result = await query(
      `SELECT id, org_id, name, encrypted_value, created_by, created_at, updated_at, accessed_at
             FROM secrets
             WHERE org_id = $1 AND id = $2
             LIMIT 1`,
      [orgId, secretId],
    );

    if (result.rows.length === 0) {
      throw new Error("Secret not found");
    }

    const secret = result.rows[0] as SecretRow;
    const plaintext = decryptSecret(
      secret.encrypted_value,
      this.getEncryptionKey(),
    );

    await query(
      `UPDATE secrets
             SET accessed_at = NOW()
             WHERE id = $1`,
      [secretId],
    );

    await this.logAudit(orgId, userId, "secret.accessed", secretId, {
      name: secret.name,
    });
    return plaintext;
  }

  async getSecretForJob(jobId: string, secretName: string): Promise<string> {
    const result = await query(
      `SELECT s.id, s.org_id, s.name, s.encrypted_value
             FROM secrets s
             JOIN jobs j ON j.pipeline_run_id = (
                 SELECT pipeline_run_id FROM jobs WHERE id = $1 LIMIT 1
             )
             WHERE s.org_id = (
                 SELECT pr.org_id
                 FROM jobs j2
                 JOIN pipeline_runs pr ON pr.id = j2.pipeline_run_id
                 WHERE j2.id = $1
                 LIMIT 1
             )
             AND s.name = $2
             LIMIT 1`,
      [jobId, secretName],
    );

    if (result.rows.length === 0) {
      throw new Error("Secret not found for job");
    }

    const secret = result.rows[0] as SecretRow;

    await query(
      `UPDATE secrets
             SET accessed_at = NOW()
             WHERE id = $1`,
      [secret.id],
    );

    await this.logAudit(
      secret.org_id,
      null,
      "secret.accessed_by_job",
      secret.id,
      {
        jobId,
        name: secret.name,
      },
    );

    return decryptSecret(secret.encrypted_value, this.getEncryptionKey());
  }

  async rotateSecret(
    orgId: string,
    secretId: string,
    newPlaintext: string,
    userId: string,
  ): Promise<SecretRecord> {
    await this.assertOrgOwner(orgId, userId);

    const existingResult = await query(
      `SELECT id, org_id, name, created_by, created_at, updated_at, accessed_at
             FROM secrets
             WHERE org_id = $1 AND id = $2
             LIMIT 1`,
      [orgId, secretId],
    );

    if (existingResult.rows.length === 0) {
      throw new Error("Secret not found");
    }

    const encryptedValue = encryptSecret(newPlaintext, this.getEncryptionKey());

    const result = await query(
      `UPDATE secrets
             SET encrypted_value = $1,
                     updated_at = NOW()
             WHERE id = $2 AND org_id = $3
             RETURNING id, org_id, name, created_by, created_at, updated_at, accessed_at`,
      [encryptedValue, secretId, orgId],
    );

    const secret = this.formatSecretRow(result.rows[0]);
    await this.logAudit(orgId, userId, "secret.updated", secret.id, {
      name: secret.name,
    });
    return secret;
  }

  async updateSecret(
    orgId: string,
    secretId: string,
    newPlaintext: string,
    userId: string,
  ): Promise<SecretRecord> {
    return this.rotateSecret(orgId, secretId, newPlaintext, userId);
  }

  async deleteSecret(
    orgId: string,
    secretId: string,
    userId: string,
  ): Promise<void> {
    await this.assertOrgOwner(orgId, userId);

    const existingResult = await query(
      `SELECT id, name FROM secrets WHERE org_id = $1 AND id = $2 LIMIT 1`,
      [orgId, secretId],
    );

    if (existingResult.rows.length === 0) {
      throw new Error("Secret not found");
    }

    await query(`DELETE FROM secrets WHERE org_id = $1 AND id = $2`, [
      orgId,
      secretId,
    ]);

    await this.logAudit(orgId, userId, "secret.deleted", secretId, {
      name: existingResult.rows[0].name,
    });
  }

  async listSecrets(orgId: string, userId: string): Promise<SecretRecord[]> {
    await this.assertOrgOwner(orgId, userId);

    const result = await query(
      `SELECT id, org_id, name, created_by, created_at, updated_at, accessed_at
             FROM secrets
             WHERE org_id = $1
             ORDER BY created_at DESC`,
      [orgId],
    );

    return result.rows.map((row) => this.formatSecretRow(row));
  }

  async listAuditLogs(
    orgId: string,
    userId: string,
    limit: number = 50,
  ): Promise<SecretAuditLogRecord[]> {
    await this.assertOrgOwner(orgId, userId);

    const safeLimit = Math.max(1, Math.min(limit, 100));
    const result = await query(
      `SELECT id, org_id, user_id, action, resource_type, resource_id, changes, created_at
             FROM audit_logs
             WHERE org_id = $1 AND resource_type = 'secret'
             ORDER BY created_at DESC
             LIMIT $2`,
      [orgId, safeLimit],
    );

    return result.rows.map((row) => this.formatAuditRow(row));
  }
}

export const secretsService = new SecretsService();
