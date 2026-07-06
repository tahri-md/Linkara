import { query } from '../../db/connection.js';
import type { Job } from '../../models/Job.js';
import { jobService } from '../../services/JobService.js';
import { logStreamService } from '../../services/LogStreamService.js';
import type { JobLog } from '../../models/JobLog.js';
interface Context {
    userId?: string;
}

interface JobArgs {
    id: string;
}

interface PipelineRunArgs {
    pipelineRunId: string;
}

interface JobStatusArgs {
    jobId: string;
}
interface JobLogsArgs {
    jobId: string;
}

function toGraphQLLogLevel(level: string): string {
    return level.toUpperCase();
}

function toGraphQLJobStatus(status: string | null): string | null {
    if (!status) {
        return null;
    }

    const normalized = status.toLowerCase();

    if (normalized === 'failure') {
        return 'FAILED';
    }

    return normalized.toUpperCase();
}

async function userCanAccessJob(userId: string, jobId: string): Promise<boolean> {
    const result = await query(
        `SELECT 1
         FROM jobs j
         JOIN pipeline_runs pr ON pr.id = j.pipeline_run_id
         JOIN org_members om ON om.org_id = pr.org_id
         WHERE j.id = $1 AND om.user_id = $2
         LIMIT 1`,
        [jobId, userId]
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

export const jobResolvers = {
    Query: {
        async job(_: unknown, args: JobArgs, context: Context): Promise<Job | null> {
            if (!context.userId) {
                throw new Error('Authentication required');
            }

            const canAccess = await userCanAccessJob(context.userId, args.id);
            if (!canAccess) {
                throw new Error('You do not have permission to access this job');
            }

            return jobService.getJobById(args.id);
        },

        async jobsByPipelineRun(
            _: unknown,
            args: PipelineRunArgs,
            context: Context
        ): Promise<Job[]> {
            if (!context.userId) {
                throw new Error('Authentication required');
            }

            const canAccess = await userCanAccessPipelineRun(context.userId, args.pipelineRunId);
            if (!canAccess) {
                throw new Error('You do not have permission to access jobs for this pipeline run');
            }

            return jobService.getJobsByPipelineRun(args.pipelineRunId);
        },

        async jobStatus(_: unknown, args: JobStatusArgs, context: Context): Promise<string | null> {
            if (!context.userId) {
                throw new Error('Authentication required');
            }

            const canAccess = await userCanAccessJob(context.userId, args.jobId);
            if (!canAccess) {
                throw new Error('You do not have permission to access this job');
            }

            const status = await jobService.getJobStatus(args.jobId);
            return toGraphQLJobStatus(status);
        },
        async jobLogs(_: unknown, args: JobLogsArgs, context: Context): Promise<JobLog[]> {
            if (!context.userId) {
                throw new Error('Authentication required');
            }

            const canAccess = await userCanAccessJob(context.userId, args.jobId);
            if (!canAccess) {
                throw new Error('You do not have permission to access logs for this job');
            }

            return logStreamService.getJobLogs(args.jobId);
        },
    },

    Job: {
        status: (job: Job): string => {
            return toGraphQLJobStatus(job.status) || 'PENDING';
        },
    },
    JobLog: {
        level: (log: JobLog): string => toGraphQLLogLevel(log.level),
    },
};