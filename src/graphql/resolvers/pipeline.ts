import { query } from '../../db/connection.js';
import { PipelineService } from '../../services/PipelineService.js';
import { WorkflowService } from '../../services/WorkflowService.js';
import type { PipelineRun, PipelineRunResponse, TriggerPipelineRunInput } from '../../models/PipelineRun.js';
import type { Job } from '../../models/Job.js';

interface Context {
  userId?: string;
}

interface PipelineRunArgs {
  id: string;
}

interface PipelineRunsArgs {
  orgId: string;
  workflowId?: string;
  limit?: number;
  offset?: number;
}

interface TriggerPipelineRunArgs {
  orgId: string;
  input: TriggerPipelineRunInput;
}

const pipelineService = new PipelineService();
const workflowService = new WorkflowService();

export async function userCanAccessOrganization(userId: string, orgId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM org_members WHERE user_id = $1 AND org_id = $2 LIMIT 1`,
    [userId, orgId]
  );
  return result.rows.length > 0;
}

async function userCanAccessPipelineRun(userId: string, pipelineRunId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1
     FROM pipeline_runs pr
     JOIN org_members om ON om.org_id = pr.org_id
     WHERE pr.id = $1 AND om.user_id = $2
     LIMIT 1`,
    [pipelineRunId, userId]
  );
  return result.rows.length > 0;
}

async function formatPipelineRun(row: any): Promise<PipelineRun> {
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    org_id: row.org_id,
    trigger_type: row.trigger_type,
    trigger_data: typeof row.trigger_data === 'string' ? JSON.parse(row.trigger_data) : row.trigger_data,
    triggered_by: row.triggered_by,
    status: row.status,
    started_at: row.started_at ? new Date(row.started_at) : null,
    completed_at: row.completed_at ? new Date(row.completed_at) : null,
    duration_seconds: row.duration_seconds,
    created_at: new Date(row.created_at),
  };
}

export const pipelineResolvers: any = {
  Query: {
    async pipelineRun(_: any, args: PipelineRunArgs, context: Context): Promise<PipelineRunResponse | null> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const canAccess = await userCanAccessPipelineRun(context.userId, args.id);
      if (!canAccess) {
        throw new Error('You do not have permission to access this pipeline run');
      }

      const result = await query(
        `SELECT id, workflow_id, org_id, trigger_type, trigger_data, triggered_by, status, started_at, completed_at, duration_seconds, created_at
         FROM pipeline_runs
         WHERE id = $1`,
        [args.id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const pipelineRun = await formatPipelineRun(result.rows[0]);

      const jobsResult = await query(
        `SELECT id, pipeline_run_id, workflow_job_id, job_name, status, docker_image, docker_container_id, started_at, completed_at, duration_seconds, exit_code, created_at
         FROM jobs
         WHERE pipeline_run_id = $1
         ORDER BY created_at ASC`,
        [args.id]
      );

      return {
        ...pipelineRun,
        jobs: jobsResult.rows as Job[],
      };
    },

    async pipelineRuns(
      _: any,
      args: PipelineRunsArgs,
      context: Context
    ): Promise<{ data: PipelineRunResponse[]; total: number }> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const canAccess = await userCanAccessOrganization(context.userId, args.orgId);
      if (!canAccess) {
        throw new Error('You do not have permission to access this organization');
      }

      let whereClause = 'WHERE pr.org_id = $1';
      const countParams: any[] = [args.orgId];
      const dataParams: any[] = [args.orgId];

      if (args.workflowId) {
        whereClause += ' AND pr.workflow_id = $2';
        countParams.push(args.workflowId);
        dataParams.push(args.workflowId);
      }

      const countResult = await query(
        `SELECT COUNT(*) as count FROM pipeline_runs pr ${whereClause}`,
        countParams
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const limit = Math.min(args.limit || 50, 100);
      const offset = args.offset || 0;

      dataParams.push(limit);
      dataParams.push(offset);

      const dataResult = await query(
        `SELECT id, workflow_id, org_id, trigger_type, trigger_data, triggered_by, status, started_at, completed_at, duration_seconds, created_at
         FROM pipeline_runs pr
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${whereClause.split('$').length} OFFSET $${whereClause.split('$').length + 1}`,
        dataParams
      );

      const pipelineRuns: PipelineRunResponse[] = await Promise.all(
        dataResult.rows.map(async (row) => {
          const pr = await formatPipelineRun(row);
          const jobsResult = await query(
            `SELECT id, pipeline_run_id, workflow_job_id, job_name, status, docker_image,
                    docker_container_id, started_at, completed_at, duration_seconds, exit_code, created_at
             FROM jobs WHERE pipeline_run_id = $1 ORDER BY created_at ASC`,
            [pr.id]
          );
          return { ...pr, jobs: jobsResult.rows as Job[] };
        })
      );

      return {
        data: pipelineRuns,
        total,
      };
    },
  },

  Mutation: {
    async triggerPipelineRun(_: any, args: TriggerPipelineRunArgs, context: Context): Promise<PipelineRunResponse> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const canAccess = await userCanAccessOrganization(context.userId, args.orgId);
      if (!canAccess) {
        throw new Error('You do not have permission to access this organization');
      }

      const workflow = await workflowService.getWorkflow(args.input.workflowId, args.orgId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const pipelineRun = await pipelineService.trigger_pipelineRun(workflow);

      const jobsResult = await query(
        `SELECT id, pipeline_run_id, workflow_job_id, job_name, status, docker_image, docker_container_id, started_at, completed_at, duration_seconds, exit_code, created_at
         FROM jobs
         WHERE pipeline_run_id = $1
         ORDER BY created_at ASC`,
        [pipelineRun.id]
      );

      return {
        ...pipelineRun,
        jobs: jobsResult.rows as Job[],
      };
    },
  },

  PipelineRun: {
    status: (run: PipelineRun): string => {
      return run.status.toUpperCase();
    },
  },
};