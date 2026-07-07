import { query } from "../db/connection.js";
import type { Job, JobStatus } from "../models/Job.js";

export interface JobRunState {
  status: JobStatus;
  started_at: Date | null;
  completed_at: Date | null;
  duration_seconds: number | null;
  exit_code: number | null;
}

export class JobService {
  async getJobById(jobId: string): Promise<Job | null> {
    const result = await query(
      `SELECT id, pipeline_run_id, workflow_job_id, job_name, status, docker_image, docker_container_id,
                            started_at, completed_at, duration_seconds, retry_count, exit_code, created_at
             FROM jobs
             WHERE id = $1`,
      [jobId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as Job;
  }

  async getJobsByPipelineRun(pipelineRunId: string): Promise<Job[]> {
    const result = await query(
      `SELECT id, pipeline_run_id, workflow_job_id, job_name, status, docker_image, docker_container_id,
                            started_at, completed_at, duration_seconds, retry_count, exit_code, created_at
             FROM jobs
             WHERE pipeline_run_id = $1
             ORDER BY created_at ASC`,
      [pipelineRunId],
    );

    return result.rows as Job[];
  }

  async markJobRunning(jobId: string): Promise<JobRunState> {
    const startedAt = new Date();
    const result = await query(
      `UPDATE jobs
             SET status = 'running',
                     started_at = $2,
                     completed_at = NULL,
                     duration_seconds = NULL,
                     exit_code = NULL
             WHERE id = $1
                     RETURNING status, started_at, completed_at, duration_seconds, retry_count, exit_code`,
      [jobId, startedAt],
    );

    if (result.rows.length === 0) {
      throw new Error("Job not found");
    }

    return result.rows[0] as JobRunState;
  }
  async updateRetryCount(
    jobId: string,
    retry_count: number,
    exit_code: number,
  ) {
    const result = await query(
      `UPDATE jobs
             SET status = 'failed',
                     retry_count = $1,
                     completed_at = NOW(),
                     duration_seconds = COALESCE(
                         EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
                         0
                     ),
                     exit_code = $3
             WHERE id = $2
             RETURNING status, started_at, completed_at, duration_seconds, retry_count, exit_code`,
      [retry_count, jobId, exit_code],
    );

    if (result.rows.length === 0) {
      throw new Error("Job not found");
    }

    return result.rows[0] as JobRunState;
  }

  async markJobCompleted(
    jobId: string,
    exitCode: number = 0,
  ): Promise<JobRunState> {
    const result = await query(
      `UPDATE jobs
             SET status = 'success',
                     completed_at = NOW(),
                     duration_seconds = COALESCE(
                         EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
                         0
                     ),
                     exit_code = $2
             WHERE id = $1
             RETURNING status, started_at, completed_at, duration_seconds, retry_count, exit_code`,
      [jobId, exitCode],
    );

    if (result.rows.length === 0) {
      throw new Error("Job not found");
    }

    return result.rows[0] as JobRunState;
  }

  async markJobFailed(
    jobId: string,
    exitCode: number = 1,
  ): Promise<JobRunState> {
    const result = await query(
      `UPDATE jobs
             SET status = 'failed',
                     completed_at = NOW(),
                     duration_seconds = COALESCE(
                         EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
                         0
                     ),
                     exit_code = $2
             WHERE id = $1
             RETURNING status, started_at, completed_at, duration_seconds, retry_count, exit_code`,
      [jobId, exitCode],
    );

    if (result.rows.length === 0) {
      throw new Error("Job not found");
    }

    return result.rows[0] as JobRunState;
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const result = await query(`SELECT status FROM jobs WHERE id = $1`, [
      jobId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].status as JobStatus;
  }
}

export const jobService = new JobService();
