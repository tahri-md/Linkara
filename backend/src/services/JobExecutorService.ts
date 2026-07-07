import { dockerService } from "./DockerService.js";
import { artifactService } from "./ArtifactService.js";
import { jobService } from "./JobService.js";
import { logStreamService } from "./LogStreamService.js";
import { notificationService } from "./NotificationService.js";
import { query } from "../db/connection.js";
import type { JobStatus } from "../models/Job.js";

export interface JobExecutionInput {
  jobId: string;
  pipelineRunId: string;
  workflowJobId: string;
  jobName: string;
  dockerImage: string;
  steps: Array<{ run: string }>;
  repoUrl: string;
  ref: string;
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
  private async resolveRetryPolicy(
    input: JobExecutionInput,
  ): Promise<{ retryCount: number; maxRetry: number }> {
    const job = await jobService.getJobById(input.jobId);
    const retryCount = input.retryCount ?? job?.retry_count ?? 0;

    if (typeof input.maxRetry === "number") {
      return { retryCount, maxRetry: input.maxRetry };
    }

    const workflowResult = await query(
      `SELECT w.definition
       FROM pipeline_runs pr
       JOIN workflows w ON w.id = pr.workflow_id
       WHERE pr.id = $1
       LIMIT 1`,
      [input.pipelineRunId],
    );

    if (workflowResult.rows.length === 0) {
      return { retryCount, maxRetry: 0 };
    }

    const definition = workflowResult.rows[0].definition;
    const parsedDefinition =
      typeof definition === "string" ? JSON.parse(definition) : definition;
    const workflowJob = parsedDefinition?.jobs?.[input.workflowJobId];
    const maxRetry =
      typeof workflowJob?.retry_count === "number"
        ? workflowJob.retry_count
        : 0;

    return { retryCount, maxRetry };
  }

  private async sendJobNotification(
    jobId: string,
    status: "success" | "failure",
  ): Promise<void> {
    try {
      await notificationService.notifyJobCompletion(jobId, status);
    } catch (err) {
      console.error(`[executor] Notification error for job ${jobId}:`, err);
    }
  }

  async executeJob(input: JobExecutionInput): Promise<JobExecutionResult> {
    const startTime = Date.now();
    const startedAt = new Date();

    try {
      console.log(`[executor] Starting job execution: ${input.jobId}`);
      await jobService.markJobRunning(input.jobId);

      const env = this.buildEnvironment(input.env, input.secrets);
      const command = this.buildCommand(input.steps);

      const result = await dockerService.executeJob({
        jobId: input.jobId,
        image: input.dockerImage,
        cmd: ["/bin/sh", "-c", command],
        env,
        repoUrl: input.repoUrl,
        ref: input.ref,
        timeout: input.timeout || 3600000,
      });

      const completedAt = new Date();
      const durationSeconds = Math.floor(
        (completedAt.getTime() - startTime) / 1000,
      );
      const artifacts = await artifactService.collectArtifacts(
        input.jobId,
        result.stdout,
      );

      if (result.exitCode === 0) {
        await jobService.markJobCompleted(input.jobId, result.exitCode);
        await this.sendJobNotification(input.jobId, "success");

        console.log(`[executor] Job completed successfully: ${input.jobId}`);
        return {
          jobId: input.jobId,
          status: "success",
          exitCode: result.exitCode,
          startedAt,
          completedAt,
          durationSeconds,
          logs: result.stdout,
          artifactCount: artifacts.length,
        };
      }

      // Non-zero exit — attempt retry or mark failed
      return await this.handleFailure(
        input,
        result.exitCode,
        result.stderr || `Container exited with code ${result.exitCode}`,
        startTime,
        startedAt,
      );
    } catch (err) {
      // Infrastructure-level error (Docker pull failure, timeout, etc.)
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `[executor] Job execution infrastructure error: ${input.jobId}:`,
        err,
      );

      return await this.handleFailure(input, 1, reason, startTime, startedAt);
    } finally {
      // Always clean up in-memory log state to prevent memory leak
      logStreamService.clear(input.jobId);
    }
  }

  /**
   * Handles a job failure: either schedules a retry (by throwing so BullMQ
   * retries the queue job) or marks the job permanently failed.
   * Called exactly once per failure — no double-invocation risk.
   */
  private async handleFailure(
    input: JobExecutionInput,
    exitCode: number,
    reason: string,
    startTime: number,
    startedAt: Date,
  ): Promise<JobExecutionResult> {
    const { retryCount, maxRetry } = await this.resolveRetryPolicy(input);
    const completedAt = new Date();
    const durationSeconds = Math.floor(
      (completedAt.getTime() - startTime) / 1000,
    );

    await logStreamService.appendLog(input.jobId, {
      message: `Job failed: ${reason}`,
      level: "error",
      lineNumber: null,
      timestamp: completedAt,
    });

    if (retryCount < maxRetry) {
      await jobService.updateRetryCount(input.jobId, retryCount + 1, exitCode);
      console.log(
        `[executor] Job ${input.jobId} failed (attempt ${retryCount + 1}/${maxRetry}), scheduling retry`,
      );
      // Throwing causes BullMQ to apply its backoff and re-enqueue
      throw new Error(
        `Job ${input.jobId} failed, retry ${retryCount + 1}/${maxRetry}: ${reason}`,
      );
    }

    await jobService.markJobFailed(input.jobId, exitCode);
    await this.sendJobNotification(input.jobId, "failure");

    console.error(
      `[executor] Job permanently failed: ${input.jobId} after ${durationSeconds}s: ${reason}`,
    );

    return {
      jobId: input.jobId,
      status: "failed",
      exitCode,
      startedAt,
      completedAt,
      durationSeconds,
      logs: "",
      artifactCount: 0,
    };
  }

  private buildEnvironment(
    customEnv?: Record<string, string>,
    secrets?: Record<string, string>,
  ): Record<string, string> {
    return {
      ...customEnv,
      ...secrets,
    };
  }

  private buildCommand(steps: Array<{ run: string }>): string {
    if (steps.length === 0) {
      throw new Error("Job must have at least one step");
    }
    return steps.map((step) => step.run).join(" && ");
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    return jobService.getJobStatus(jobId);
  }

  async getJobLogs(jobId: string): Promise<string> {
    return logStreamService.getJobLogText(jobId);
  }
}

export const jobExecutorService = new JobExecutorService();
