import { dockerService } from './DockerService.js';
import { artifactService } from './ArtifactService.js';
import { jobService } from './JobService.js';
import { logStreamService } from './LogStreamService.js';
import type { JobStatus } from '../models/Job.js';

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

      const status: JobStatus = result.exitCode === 0 ? 'success' : 'failed';

      if (status === 'success') {
        await jobService.markJobCompleted(input.jobId, result.exitCode);
      } else {
        await jobService.markJobFailed(input.jobId, result.exitCode);
      }

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

      await jobService.markJobFailed(input.jobId, 1);

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

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    return jobService.getJobStatus(jobId);
  }

  async getJobLogs(jobId: string): Promise<string> {
    return logStreamService.getJobLogText(jobId);
  }
}

export const jobExecutorService = new JobExecutorService();