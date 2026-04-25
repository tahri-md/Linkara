import dotenv from 'dotenv';

dotenv.config();

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface QueueConfig {
  jobExecutionConcurrency: number;
  logProcessingConcurrency: number;
  defaultAttempts: number;
  defaultBackoffMs: number;
}

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const redisConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: toNumber(process.env.REDIS_PORT, 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: toNumber(process.env.REDIS_DB, 0),
};

export const queueConfig: QueueConfig = {
  jobExecutionConcurrency: toNumber(process.env.JOB_EXECUTION_CONCURRENCY, 5),
  logProcessingConcurrency: toNumber(process.env.LOG_PROCESSING_CONCURRENCY, 10),
  defaultAttempts: toNumber(process.env.QUEUE_DEFAULT_ATTEMPTS, 3),
  defaultBackoffMs: toNumber(process.env.QUEUE_DEFAULT_BACKOFF_MS, 2000),
};

export const queueNames = {
  jobExecution: 'job-execution-queue',
  logProcessing: 'log-processing-queue',
} as const;
