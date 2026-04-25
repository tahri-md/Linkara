import { query } from '../db/connection.js';
import { dockerService } from './DockerService.js';
import { artifactService } from './ArtifactService.js';
import type { JobStatus } from '../models/Workflow.js';

export interface JobExecutionInput {
  jobId: string;
  pipelineRunId: string;
  workflowJobId: string;
  jobName: string;
  dockerImage: string;
  steps: Array<{ run: string }>;
  env?: Record<string, string>;
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
  async executeJob(input: JobExecutionInput): Promise<JobExecutionResult> {
    const startTime = Date.now();
    const startedAt = new Date();

    try {
      console.log(`[executor] Starting job execution: ${input.jobId}`);

      await this.updateJobStatus(input.jobId, 'running', startedAt);

      const env = await this.buildEnvironment(input.env, input.secrets);
      const command = this.buildCommand(input.steps);

      const result = await dockerService.executeJob({
        image: input.dockerImage,
        cmd: ['/bin/sh', '-c', command],
        env,
        timeout: input.timeout || 3600000,
      });

      const completedAt = new Date();
      const durationSeconds = Math.floor((completedAt.getTime() - startTime) / 1000);

      await this.storeLogs(input.jobId, result.stdout);

      const artifacts = await artifactService.collectArtifacts(input.jobId, result.stdout);

      const status: JobStatus = result.exitCode === 0 ? 'success' : 'failed';

      await this.updateJobStatus(
        input.jobId,
        status,
        startedAt,
        completedAt,
        durationSeconds,
        result.exitCode
      );

      console.log(`[executor] Job completed: ${input.jobId} (status: ${status})`);

      return {
        jobId: input.jobId,
        status,
        exitCode: result.exitCode,
        startedAt,
        completedAt,
        durationSeconds,
        logs: result.stdout,
        artifactCount: artifacts.length,
      };
    } catch (err) {
      console.error(`[executor] Job execution error:`, err);

      const completedAt = new Date();
      const durationSeconds = Math.floor((completedAt.getTime() - startTime) / 1000);

      await this.updateJobStatus(
        input.jobId,
        'failed',
        startedAt,
        completedAt,
        durationSeconds,
        1,
        err instanceof Error ? err.message : 'Unknown error'
      );

      throw err;
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

  private async storeLogs(jobId: string, logs: string): Promise<void> {
    try {
      const lines = logs.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().length === 0) {
          continue;
        }

        const level = this.detectLogLevel(line);

        await query(
          `INSERT INTO job_logs (job_id, line_number, level, message, timestamp, created_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [jobId, i, level, line]
        );
      }

      console.log(`[executor] Stored ${lines.length} log lines for job ${jobId}`);
    } catch (err) {
      console.error(`[executor] Store logs error:`, err);
    }
  }

  private detectLogLevel(line: string): string {
    const upperLine = line.toUpperCase();

    if (upperLine.includes('ERROR') || upperLine.includes('FATAL')) {
      return 'error';
    }
    if (upperLine.includes('WARN')) {
      return 'warning';
    }
    if (upperLine.includes('DEBUG')) {
      return 'debug';
    }

    return 'info';
  }

  private async updateJobStatus(
    jobId: string,
    status: JobStatus,
    startedAt?: Date,
    completedAt?: Date,
    durationSeconds?: number,
    exitCode?: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      const updates: string[] = ['status = $1'];
      const params: any[] = [status];
      let paramCount = 2;

      if (startedAt) {
        updates.push(`started_at = $${paramCount++}`);
        params.push(startedAt);
      }

      if (completedAt) {
        updates.push(`completed_at = $${paramCount++}`);
        params.push(completedAt);
      }

      if (durationSeconds !== undefined) {
        updates.push(`duration_seconds = $${paramCount++}`);
        params.push(durationSeconds);
      }

      if (exitCode !== undefined) {
        updates.push(`exit_code = $${paramCount++}`);
        params.push(exitCode);
      }

      params.push(jobId);

      const updateQuery = `
        UPDATE jobs
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
      `;

      await query(updateQuery, params);

      console.log(`[executor] Updated job status: ${jobId} -> ${status}`);
    } catch (err) {
      console.error(`[executor] Update job status error:`, err);
      throw err;
    }
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    try {
      const result = await query(`SELECT status FROM jobs WHERE id = $1`, [jobId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].status as JobStatus;
    } catch (err) {
      console.error(`[executor] Get job status error:`, err);
      throw err;
    }
  }

  async getJobLogs(jobId: string): Promise<string> {
    try {
      const result = await query(
        `SELECT message FROM job_logs WHERE job_id = $1 ORDER BY line_number ASC`,
        [jobId]
      );

      return result.rows.map((row) => row.message).join('\n');
    } catch (err) {
      console.error(`[executor] Get job logs error:`, err);
      throw err;
    }
  }
}

export const jobExecutorService = new JobExecutorService();