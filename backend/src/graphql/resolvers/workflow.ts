import { WorkflowService } from '../../services/WorkflowService.js';
import { hasPermission } from '../../utils/permissions.js';
import type {
  Workflow,
  WorkflowListResponse,
  CreateWorkflowInput,
  UpdateWorkflowInput,
} from '../../models/Workflow.js';
import { query } from '../../db/connection.js';

export interface Context {
  userId?: string;
}

interface WorkflowArgs {
  id: string;
}

interface WorkflowsArgs {
  orgId: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

interface CreateWorkflowArgs {
  orgId: string;
  input: CreateWorkflowInput;
}

interface UpdateWorkflowArgs {
  id: string;
  orgId: string;
  input: UpdateWorkflowInput;
}

interface DeleteWorkflowArgs {
  id: string;
  orgId: string;
  hardDelete?: boolean;
}

interface RestoreWorkflowArgs {
  id: string;
  orgId: string;
}

const workflowService = new WorkflowService();

async function getUserOrgRole(
  userId: string,
  orgId: string
): Promise<string | null> {
  const result = await query(
    `SELECT role FROM org_members WHERE user_id = $1 AND org_id = $2`,
    [userId, orgId]
  );
  return result.rows.length > 0 ? result.rows[0].role : null;
}

export const workflowResolvers: any = {
  Query: {
    async workflow(
      _: any,
      args: WorkflowArgs,
      context: Context
    ): Promise<Workflow | null> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const result = await query(
        `SELECT org_id FROM workflows WHERE id = $1`,
        [args.id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const orgId = result.rows[0].org_id;
      const userRole = await getUserOrgRole(context.userId, orgId);

      if (!userRole) {
        throw new Error('You do not have permission to access this organization');
      }

      return await workflowService.getWorkflow(args.id, orgId);
    },

    async workflows(
      _: any,
      args: WorkflowsArgs,
      context: Context
    ): Promise<WorkflowListResponse> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const userRole = await getUserOrgRole(context.userId, args.orgId);
      if (!userRole) {
        throw new Error('You do not have permission to access this organization');
      }

      const limit = Math.min(args.limit || 50, 100);
      const offset = args.offset || 0;

      return await workflowService.listWorkflows(
        args.orgId,
        args.activeOnly || false,
        limit,
        offset
      );
    },
  },

  Mutation: {
    async createWorkflow(
      _: any,
      args: CreateWorkflowArgs,
      context: Context
    ): Promise<Workflow> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const userRole = await getUserOrgRole(context.userId, args.orgId);
      if (!userRole) {
        throw new Error('You do not have permission to access this organization');
      }

      if (!hasPermission(userRole as any, 'create_workflow')) {
        throw new Error('You do not have permission to create workflows');
      }

      return await workflowService.createWorkflow(
        args.orgId,
        context.userId,
        args.input
      );
    },

    async updateWorkflow(
      _: any,
      args: UpdateWorkflowArgs,
      context: Context
    ): Promise<Workflow> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const userRole = await getUserOrgRole(context.userId, args.orgId);
      if (!userRole) {
        throw new Error('You do not have permission to access this organization');
      }

      if (!hasPermission(userRole as any, 'create_workflow')) {
        throw new Error('You do not have permission to edit workflows');
      }

      return await workflowService.updateWorkflow(
        args.id,
        args.orgId,
        context.userId,
        args.input
      );
    },

    async deleteWorkflow(
      _: any,
      args: DeleteWorkflowArgs,
      context: Context
    ): Promise<boolean> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const userRole = await getUserOrgRole(context.userId, args.orgId);
      if (!userRole) {
        throw new Error('You do not have permission to access this organization');
      }

      if (userRole !== 'ADMIN' && userRole !== 'OWNER') {
        throw new Error('You do not have permission to delete workflows');
      }

      return await workflowService.deleteWorkflow(
        args.id,
        args.orgId,
        context.userId,
        args.hardDelete || false
      );
    },

    async restoreWorkflow(
      _: any,
      args: RestoreWorkflowArgs,
      context: Context
    ): Promise<Workflow> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const userRole = await getUserOrgRole(context.userId, args.orgId);
      if (!userRole) {
        throw new Error('You do not have permission to access this organization');
      }

      if (userRole !== 'ADMIN' && userRole !== 'OWNER') {
        throw new Error('You do not have permission to restore workflows');
      }

      return await workflowService.restoreWorkflow(
        args.id,
        args.orgId,
        context.userId
      );
    },
  },
    Workflow: {
    created_at: (p: any) => p.created_at,
    updated_at: (p: any) => p.updated_at,
  },
  WorkflowDefinition: {
    jobs: (p: any) => {
      if (Array.isArray(p.jobs)) return p.jobs;
      return Object.values(p.jobs || {});
    },
  },
  WorkflowTrigger: {
    config: (p: any) => (p.config ? JSON.stringify(p.config) : null),
  },
};
