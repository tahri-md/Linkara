import { Worker, Job as BullJob } from "bullmq";
import {
  queueConfig,
  queueNames,
  bullmqConnectionOptions,
} from "../config/queue.js";
import { jobExecutorService } from "../services/JobExecutorService.js";
import { PipelineService } from "../services/PipelineService.js";
import { query } from "../db/connection.js";

interface JobExecutionPayload {
  jobId: string;
  pipelineRunId: string;
  workflowJobId: string;
  workflowId?: string;
  orgId?: string;
  retryCount?: number;
  maxRetry?: number;
}

const pipelineService = new PipelineService();

async function resolveJobInput(payload: JobExecutionPayload) {
  // Load the job row
  const jobResult = await query(
    `SELECT j.id, j.pipeline_run_id, j.workflow_job_id, j.job_name,
            j.docker_image, j.retry_count, j.exit_code,
            w.definition
     FROM jobs j
     JOIN pipeline_runs pr ON pr.id = j.pipeline_run_id
     JOIN workflows w ON w.id = pr.workflow_id
     WHERE j.id = $1`,
    [payload.jobId],
  );

  if (jobResult.rows.length === 0) {
    throw new Error(`Job not found: ${payload.jobId}`);
  }

  const row = jobResult.rows[0];
  const definition =
    typeof row.definition === "string"
      ? JSON.parse(row.definition)
      : row.definition;

  const workflowJob = definition?.jobs?.[row.workflow_job_id];
  if (!workflowJob) {
    throw new Error(
      `Workflow job definition not found for job_id=${payload.jobId} ` +
        `workflow_job_id=${row.workflow_job_id}`,
    );
  }

  // Load secrets for this org
  const secretsResult = await query(
    `SELECT s.name, s.encrypted_value
     FROM secrets s
     JOIN pipeline_runs pr ON pr.org_id = s.org_id
     WHERE pr.id = $1`,
    [row.pipeline_run_id],
  );

  const secrets: Record<string, string> = {};
  if (secretsResult.rows.length > 0) {
    const { decryptSecret } = await import("../utils/encryption.js");
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (encryptionKey) {
      for (const s of secretsResult.rows) {
        try {
          secrets[s.name] = decryptSecret(s.encrypted_value, encryptionKey);
        } catch {
          console.error(
            `[worker] Failed to decrypt secret ${s.name} for job ${payload.jobId}`,
          );
        }
      }
    }
  }

  return {
    jobId: row.id,
    pipelineRunId: row.pipeline_run_id,
    workflowJobId: row.workflow_job_id,
    jobName: row.job_name,
    dockerImage: workflowJob.image,
    steps: workflowJob.steps ?? [],
    retryCount: payload.retryCount ?? row.retry_count ?? 0,
    maxRetry: payload.maxRetry ?? workflowJob.retry_count ?? 0,
    timeout: workflowJob.timeout,
    secrets,
  };
}

export function createJobExecutionWorker(): Worker {
  const worker = new Worker(
    queueNames.jobExecution,
    async (bullJob: BullJob<JobExecutionPayload>) => {
      const payload = bullJob.data;
      console.log(
        `[worker] Processing job ${payload.jobId} (bull job ${bullJob.id})`,
      );

      const input = await resolveJobInput(payload);
      const result = await jobExecutorService.executeJob(input);

      // After this job finishes, unlock any dependent jobs
      try {
        await pipelineService.queue_dependent_jobs(
          payload.pipelineRunId,
          payload.jobId,
          result.status,
        );
      } catch (err) {
        // Don't fail the job just because dependent-queue logic errored
        console.error(
          `[worker] Error queuing dependent jobs for ${payload.jobId}:`,
          err,
        );
      }

      return result;
    },
    {
      connection: bullmqConnectionOptions,
      concurrency: queueConfig.jobExecutionConcurrency,
      // BullMQ's own retry is a safety net; our JobExecutorService handles
      // application-level retries by throwing when retries remain.
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 2000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(
      `[worker] Job ${job.data.jobId} completed (bull job ${job.id})`,
    );
  });

  worker.on("failed", (job, err) => {
    if (job) {
      console.error(
        `[worker] Job ${job.data.jobId} failed (bull job ${job.id}):`,
        err.message,
      );
    } else {
      console.error(`[worker] Unknown job failed:`, err.message);
    }
  });

  worker.on("error", (err) => {
    console.error(`[worker] Worker error:`, err);
  });

  console.log(
    `[worker] Job execution worker started ` +
      `(concurrency=${queueConfig.jobExecutionConcurrency})`,
  );

  return worker;
}
