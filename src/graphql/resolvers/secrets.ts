import { secretsService } from '../../services/SecretsService.js';
import { Context } from '../schema.js';

interface CreateSecretArgs {
  orgId: string;
  input: {
    name: string;
    value: string;
  };
}

interface UpdateSecretArgs {
  orgId: string;
  secretId: string;
  input: {
    value: string;
  };
}

interface DeleteSecretArgs {
  orgId: string;
  secretId: string;
}

interface SecretsArgs {
  orgId: string;
}

interface SecretAuditLogsArgs {
  orgId: string;
  limit?: number;
}

const formatSecret = (secret: Awaited<ReturnType<typeof secretsService.listSecrets>>[number]) => ({
  ...secret,
  created_at: secret.created_at.toISOString(),
  updated_at: secret.updated_at.toISOString(),
  accessed_at: secret.accessed_at ? secret.accessed_at.toISOString() : null,
});

const formatAuditLog = (auditLog: Awaited<ReturnType<typeof secretsService.listAuditLogs>>[number]) => ({
  ...auditLog,
  created_at: auditLog.created_at.toISOString(),
});

export const secretsResolvers = {
  Query: {
    async secrets(_: unknown, args: SecretsArgs, context: Context) {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const secrets = await secretsService.listSecrets(args.orgId, context.userId);
      return secrets.map(formatSecret);
    },

    async secretAuditLogs(_: unknown, args: SecretAuditLogsArgs, context: Context) {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const auditLogs = await secretsService.listAuditLogs(
        args.orgId,
        context.userId,
        args.limit ?? 50
      );

      return auditLogs.map(formatAuditLog);
    },
  },

  Mutation: {
    async createSecret(_: unknown, args: CreateSecretArgs, context: Context) {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const secret = await secretsService.storeSecret(
        args.orgId,
        args.input.name,
        args.input.value,
        context.userId
      );

      return formatSecret(secret);
    },

    async updateSecret(_: unknown, args: UpdateSecretArgs, context: Context) {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const secret = await secretsService.updateSecret(
        args.orgId,
        args.secretId,
        args.input.value,
        context.userId
      );

      return formatSecret(secret);
    },

    async deleteSecret(_: unknown, args: DeleteSecretArgs, context: Context) {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      await secretsService.deleteSecret(args.orgId, args.secretId, context.userId);

      return {
        success: true,
        message: 'Secret deleted successfully',
      };
    },
  },
};