import { Queue, QueueEvents } from "bullmq";
import { query } from "../db/connection.js";
import {
  queueConfig,
  queueNames,
  bullmqConnectionOptions,
} from "../config/queue.js";

interface JobExecutionPayload {
  jobId: string;
  pipelineRunId: string;
  workflowJobId: string;
  workflowId?: string;
  orgId?: string;
  retryCount?: number;
  maxRetry?: number;
}

const defaultJobOptions = {
  attempts: queueConfig.defaultAttempts,
  backoff: {
    type: "exponential" as const,
    delay: queueConfig.defaultBackoffMs,
  },
  removeOnComplete: 1000,
  removeOnFail: 2000,
};

export const jobExecutionQueue = new Queue(queueNames.jobExecution, {
  connection: bullmqConnectionOptions,
  defaultJobOptions,
});

export const logProcessingQueue = new Queue(queueNames.logProcessing, {
  connection: bullmqConnectionOptions,
  defaultJobOptions,
});

export const jobExecutionQueueEvents = new QueueEvents(
  queueNames.jobExecution,
  {
    connection: bullmqConnectionOptions,
  },
);

export const logProcessingQueueEvents = new QueueEvents(
  queueNames.logProcessing,
  {
    connection: bullmqConnectionOptions,
  },
);

const registerQueueEventLogs = (
  events: QueueEvents,
  queueName: string,
): void => {
  events.on("active", ({ jobId, prev }) => {
    console.log(
      `[queue:${queueName}] Job ${jobId} started (prev: ${prev ?? "unknown"})`,
    );
  });

  events.on("completed", ({ jobId }) => {
    console.log(`[queue:${queueName}] Job ${jobId} completed`);
  });

  events.on("failed", ({ jobId, failedReason }) => {
    console.error(`[queue:${queueName}] Job ${jobId} failed: ${failedReason}`);
  });

  events.on("error", (err) => {
    console.error(`[queue:${queueName}] Event listener error:`, err);
  });
};

const calculateRetryDelayMs = (retryCount: number): number => {
  return queueConfig.defaultBackoffMs * 2 ** Math.max(retryCount - 1, 0);
};

const resolveMaxRetry = async (
  payload: JobExecutionPayload,
): Promise<number> => {
  if (typeof payload.maxRetry === "number") {
    return payload.maxRetry;
  }

  const result = await query(
    `SELECT w.definition
		 FROM jobs j
		 JOIN pipeline_runs pr ON pr.id = j.pipeline_run_id
		 JOIN workflows w ON w.id = pr.workflow_id
		 WHERE j.id = $1
		 LIMIT 1`,
    [payload.jobId],
  );

  if (result.rows.length === 0) {
    return 0;
  }

  const definition = result.rows[0].definition;
  const parsedDefinition =
    typeof definition === "string" ? JSON.parse(definition) : definition;
  const workflowJob = parsedDefinition?.jobs?.[payload.workflowJobId];
  return typeof workflowJob?.retry_count === "number"
    ? workflowJob.retry_count
    : 0;
};

const scheduleRetry = async (
  queue: Queue,
  queueName: string,
  jobId: string,
  failedReason?: string,
): Promise<void> => {
  const queuedJob = await queue.getJob(jobId);
  if (!queuedJob) {
    return;
  }

  const payload = queuedJob.data as JobExecutionPayload;
  const jobStateResult = await query(
    `SELECT retry_count
		 FROM jobs
		 WHERE id = $1
		 LIMIT 1`,
    [payload.jobId],
  );
  const retryCount =
    jobStateResult.rows.length > 0 &&
    typeof jobStateResult.rows[0].retry_count === "number"
      ? jobStateResult.rows[0].retry_count
      : typeof payload.retryCount === "number"
        ? payload.retryCount
        : 0;
  const maxRetry = await resolveMaxRetry(payload);

  if (retryCount >= maxRetry) {
    console.error(
      `[queue:${queueName}] Job ${payload.jobId} exhausted retries (${retryCount}/${maxRetry}): ${failedReason ?? "no reason provided"}`,
    );
    return;
  }

  const nextRetryCount = retryCount + 1;
  const delay = calculateRetryDelayMs(nextRetryCount);

  await query(
    `UPDATE jobs
		 SET status = 'pending',
		     started_at = NULL,
		     completed_at = NULL,
		     duration_seconds = NULL,
		     exit_code = NULL
		 WHERE id = $1`,
    [payload.jobId],
  );

  await queue.add(
    queuedJob.name,
    {
      ...payload,
      retryCount,
      maxRetry,
    },
    {
      delay,
    },
  );

  console.log(
    `[queue:${queueName}] Job ${payload.jobId} requeued for retry ${nextRetryCount}/${maxRetry} in ${delay}ms`,
  );
};

let listenersInitialized = false;

export async function initializeQueueInfrastructure(): Promise<void> {
  if (listenersInitialized) {
    return;
  }

  await Promise.all([
    jobExecutionQueue.waitUntilReady(),
    logProcessingQueue.waitUntilReady(),
    jobExecutionQueueEvents.waitUntilReady(),
    logProcessingQueueEvents.waitUntilReady(),
  ]);

  registerQueueEventLogs(jobExecutionQueueEvents, queueNames.jobExecution);
  jobExecutionQueueEvents.on("failed", ({ jobId, failedReason }) => {
    if (!jobId) {
      return;
    }

    void scheduleRetry(
      jobExecutionQueue,
      queueNames.jobExecution,
      jobId,
      failedReason,
    ).catch((err) => {
      console.error(
        `[queue:${queueNames.jobExecution}] Retry handler error:`,
        err,
      );
    });
  });
  registerQueueEventLogs(logProcessingQueueEvents, queueNames.logProcessing);

  listenersInitialized = true;

  console.log(
    `[queue] Ready with concurrency jobExecution=${queueConfig.jobExecutionConcurrency}, logProcessing=${queueConfig.logProcessingConcurrency}`,
  );
}

export async function closeQueueInfrastructure(): Promise<void> {
  await Promise.all([
    jobExecutionQueueEvents.close(),
    logProcessingQueueEvents.close(),
    jobExecutionQueue.close(),
    logProcessingQueue.close(),
  ]);
}

export const jobqueue = jobExecutionQueue;
export const logqueue = logProcessingQueue;
