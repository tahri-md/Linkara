import { dockerService } from './DockerService.js';
import { artifactService } from './ArtifactService.js';
import { jobService } from './JobService.js';
import { logStreamService } from './LogStreamService.js';
import { query } from '../db/connection.js';
import type { JobStatus } from '../models/Job.js';

export interface JobExecutionInput {
  jobId: string;
  pipelineRunId: string;
  workflowJobId: string;
  jobName: string;
  dockerImage: string;
  steps: Array<{ run: string }>;
  env?: Record<string, string>;
  retryCount?: number;
  maxRetry?: number;
  timeout?: number;
  secrets?: Record<string, string>;
}

export interface JobExecutionResult {
  jobId: string;
  status: JobStatus;
  exitCode: number;
  startedAt: Date;
  completedAt: Date;
  durationSeconds: number;
  logs: string;
  artifactCount: number;
}

export class JobExecutorService {
  private async resolveRetryPolicy(input: JobExecutionInput): Promise<{ retryCount: number; maxRetry: number }> {
    const job = await jobService.getJobById(input.jobId);
    const retryCount = input.retryCount ?? job?.retry_count ?? 0;

    if (typeof input.maxRetry === 'number') {
      return { retryCount, maxRetry: input.maxRetry };
    }

    const workflowResult = await query(
      `SELECT w.definition
       FROM pipeline_runs pr
       JOIN workflows w ON w.id = pr.workflow_id
       WHERE pr.id = $1
       LIMIT 1`,
      [input.pipelineRunId]
    );

    if (workflowResult.rows.length === 0) {
      return { retryCount, maxRetry: 0 };
    }

    const definition = workflowResult.rows[0].definition;
    const parsedDefinition = typeof definition === 'string' ? JSON.parse(definition) : definition;
    const workflowJob = parsedDefinition?.jobs?.[input.workflowJobId];
    const maxRetry = typeof workflowJob?.retry_count === 'number' ? workflowJob.retry_count : 0;

    return { retryCount, maxRetry };
  }

  private async recordFailureAndMaybeRetry(
    input: JobExecutionInput,
    exitCode: number,
    reason: string,
    startTime: number
  ): Promise<never> {
    const { retryCount, maxRetry } = await this.resolveRetryPolicy(input);
    const nextRetryCount = retryCount + 1;
    const completedAt = new Date();
    const durationSeconds = Math.floor((completedAt.getTime() - startTime) / 1000);

    await logStreamService.appendLog(input.jobId, {
      message: `Job failed: ${reason}`,
      level: 'error',
      lineNumber: null,
      timestamp: completedAt,
    });

    if (retryCount < maxRetry) {
      await jobService.updateRetryCount(input.jobId, nextRetryCount, exitCode);
      console.error(
        `[executor] Job failed: ${input.jobId} (attempt ${nextRetryCount}/${maxRetry}), scheduling retry`
      );
      throw new Error(
        `Job ${input.jobId} failed but will be retried (${nextRetryCount}/${maxRetry}): ${reason}`
      );
    }

    await jobService.markJobFailed(input.jobId, exitCode);
    console.error(
      `[executor] Job failed permanently: ${input.jobId} after ${durationSeconds}s: ${reason}`
    );
    throw new Error(`Job ${input.jobId} failed permanently: ${reason}`);
  }

  async executeJob(input: JobExecutionInput): Promise<JobExecutionResult> {
    const startTime = Date.now();
    const startedAt = new Date();

    try {
      console.log(`[executor] Starting job execution: ${input.jobId}`);

      await jobService.markJobRunning(input.jobId);

      const env = await this.buildEnvironment(input.env, input.secrets);
      const command = this.buildCommand(input.steps);

      const result = await dockerService.executeJob({
        jobId: input.jobId,
        image: input.dockerImage,
        cmd: ['/bin/sh', '-c', command],
        env,
        timeout: input.timeout || 3600000,
      });

      const completedAt = new Date();
      const durationSeconds = Math.floor((completedAt.getTime() - startTime) / 1000);

      const artifacts = await artifactService.collectArtifacts(input.jobId, result.stdout);

      if (result.exitCode === 0) {
        await jobService.markJobCompleted(input.jobId, result.exitCode);
      } else {
        await this.recordFailureAndMaybeRetry(
          input,
          result.exitCode,
          result.stderr || `Container exited with code ${result.exitCode}`,
          startTime
        );
      }

      console.log(`[executor] Job completed: ${input.jobId} (status: success)`);

      return {
        jobId: input.jobId,
        status: 'success',
        exitCode: result.exitCode,
        startedAt,
        completedAt,
        durationSeconds,
        logs: result.stdout,
        artifactCount: artifacts.length,
      };
    } catch (err) {
      console.error(`[executor] Job execution error:`, err);

      const reason = err instanceof Error ? err.message : String(err);
      await this.recordFailureAndMaybeRetry(input, 1, reason, startTime);
      throw new Error(`Job ${input.jobId} failed: ${reason}`);
    }
  }

  private async buildEnvironment(
    customEnv?: Record<string, string>,
    secrets?: Record<string, string>
  ): Promise<Record<string, string>> {
    let env: Record<string, string> = {
      ...customEnv,
    };

    if (secrets) {
      env = { ...env, ...secrets };
    }

    return env;
  }

  private buildCommand(steps: Array<{ run: string }>): string {
    if (steps.length === 0) {
      throw new Error('Job must have at least one step');
    }

    const commands = steps.map((step) => step.run).join(' && ');
    return commands;
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    return jobService.getJobStatus(jobId);
  }

  async getJobLogs(jobId: string): Promise<string> {
    return logStreamService.getJobLogText(jobId);
  }
}

export const jobExecutorService = new JobExecutorService();