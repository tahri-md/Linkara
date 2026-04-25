import { Queue, QueueEvents } from 'bullmq';
import { queueConfig, queueNames } from '../config/queue.js';
import { redis } from './redis.js';

const defaultJobOptions = {
	attempts: queueConfig.defaultAttempts,
	backoff: {
		type: 'exponential' as const,
		delay: queueConfig.defaultBackoffMs,
	},
	removeOnComplete: 1000,
	removeOnFail: 2000,
};

export const jobExecutionQueue = new Queue(queueNames.jobExecution, {
	connection: redis,
	defaultJobOptions,
});

export const logProcessingQueue = new Queue(queueNames.logProcessing, {
	connection: redis,
	defaultJobOptions,
});

export const jobExecutionQueueEvents = new QueueEvents(queueNames.jobExecution, {
	connection: redis,
});

export const logProcessingQueueEvents = new QueueEvents(queueNames.logProcessing, {
	connection: redis,
});

const registerQueueEventLogs = (events: QueueEvents, queueName: string): void => {
	events.on('active', ({ jobId, prev }) => {
		console.log(`[queue:${queueName}] Job ${jobId} started (prev: ${prev ?? 'unknown'})`);
	});

	events.on('completed', ({ jobId }) => {
		console.log(`[queue:${queueName}] Job ${jobId} completed`);
	});

	events.on('failed', ({ jobId, failedReason }) => {
		console.error(`[queue:${queueName}] Job ${jobId} failed: ${failedReason}`);
	});

	events.on('error', (err) => {
		console.error(`[queue:${queueName}] Event listener error:`, err);
	});
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
	registerQueueEventLogs(logProcessingQueueEvents, queueNames.logProcessing);

	listenersInitialized = true;

	console.log(
		`[queue] Ready with concurrency jobExecution=${queueConfig.jobExecutionConcurrency}, logProcessing=${queueConfig.logProcessingConcurrency}`
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