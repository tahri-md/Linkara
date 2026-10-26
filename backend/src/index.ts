import express from 'express';
import { createApolloServer, createApolloMiddleware } from './config/apollo.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers/index.js';
import { authMiddleware } from './middleware/auth.js';
import { testConnection } from './db/connection.js';
import { initializeQueueInfrastructure, closeQueueInfrastructure } from './queue/queues.js';
import { testRedisConnection, closeRedisConnection } from './queue/redis.js';
import { createJobExecutionWorker } from './queue/worker.js';
import type { Worker } from 'bullmq';
import cors from 'cors';
import { WebhooksService } from './services/WebhooksService.js';
import { logStreamService } from './services/LogStreamService.js';
import { userCanAccessJob } from './graphql/resolvers/job.js';
const PORT = process.env.PORT || 4000;

// Fail fast if required env vars are missing
const REQUIRED_ENV = ['JWT_SECRET', 'ENCRYPTION_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Fatal: required environment variable ${key} is not set`);
    process.exit(1);
  }
}

let jobWorker: Worker | null = null;

async function startServer() {
  const app = express();

  await initializeQueueInfrastructure();

  // Start the job execution worker
  jobWorker = createJobExecutionWorker();

  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }));
  app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'apollo-require-preflight', 'x-apollo-operation-name'],
}));
  app.use(authMiddleware());

  app.get('/jobs/:jobId/logs/stream', async (req, res) => {
    const userId = (req as any).userId as string | undefined;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { jobId } = req.params;
    try {
      if (!(await userCanAccessJob(userId, jobId))) {
        res.status(403).json({ error: 'You do not have permission to access logs for this job' });
        return;
      }

      res.status(200);
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();

      const sendLog = (log: unknown) => {
        res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
      };
      const unsubscribe = logStreamService.subscribe(jobId, sendLog);
      const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20000);
      res.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });

      // Subscribe before reading history so logs written during setup are not
      // missed. The client de-duplicates by log id because these may overlap.
      const existingLogs = await logStreamService.getJobLogs(jobId);
      for (const log of existingLogs) sendLog(log);
    } catch (error) {
      console.error('[logs] Failed to open log stream:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to open log stream' });
      else res.end();
    }
  });

  const apolloServer = createApolloServer(typeDefs, resolvers);
  await apolloServer.start();

  app.use('/graphql', createApolloMiddleware(apolloServer));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/db', async (req, res) => {
    const isConnected = await testConnection();
    res.json({ status: isConnected ? 'ok' : 'failed' });
  });

  app.get('/health/redis', async (req, res) => {
    const isConnected = await testRedisConnection();
    res.json({ status: isConnected ? 'ok' : 'failed' });
  });

  const webhooksService = new WebhooksService();

  // Receives incoming webhook deliveries from GitHub/GitLab/Bitbucket.
  // This is a plain REST endpoint (not GraphQL) since that's what providers POST to.
  app.post('/webhooks/:id', async (req, res) => {
    const webhookId = req.params.id;

    // Each provider names its signature/event-type headers differently.
    const signature =
      (req.headers['x-hub-signature-256'] as string) || // GitHub
      (req.headers['x-gitlab-token'] as string) ||       // GitLab
      (req.headers['x-hub-signature'] as string) ||      // Bitbucket / legacy GitHub
      '';

    const eventType =
      (req.headers['x-github-event'] as string) ||
      (req.headers['x-gitlab-event'] as string) ||
      (req.headers['x-event-key'] as string) ||
      'push';

    try {
      const pipelineRun = await webhooksService.handleWebhookEvent(
        webhookId,
        req.body,
        signature,
        eventType,
        (req as any).rawBody,
      );
      res.status(202).json({ success: true, pipelineRunId: pipelineRun.id });
    } catch (error) {
      console.error(`[WebhookRoute] Error processing incoming webhook:`, error);
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.listen(PORT, async () => {
    const dbConnected = await testConnection();
    const redisConnected = await testRedisConnection();
    if (dbConnected) {
      console.log(`Server started on http://localhost:${PORT}/graphql`);
      console.log('Database connected');
    } else {
      console.warn('Warning: Database connection failed');
    }
    if (redisConnected) {
      console.log('Redis connected');
    } else {
      console.warn('Warning: Redis connection failed');
    }
  });
}

async function shutdownGracefully(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down gracefully...`);
  try {
    if (jobWorker) {
      await jobWorker.close();
    }
    await closeQueueInfrastructure();
    await closeRedisConnection();
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
  }
  process.exit(0);
}

process.on('SIGINT', () => { void shutdownGracefully('SIGINT'); });
process.on('SIGTERM', () => { void shutdownGracefully('SIGTERM'); });

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
