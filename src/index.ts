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