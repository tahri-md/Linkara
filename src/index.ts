import express from 'express';
import { createApolloServer, createApolloMiddleware } from './config/apollo.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers/index.js';
import { authMiddleware } from './middleware/auth.js';
import { testConnection } from './db/connection.js';
import { initializeQueueInfrastructure, closeQueueInfrastructure } from './queue/queues.js';
import { testRedisConnection, closeRedisConnection } from './queue/redis.js';

const PORT = process.env.PORT || 4000;

async function startServer() {
  const app = express();

  await initializeQueueInfrastructure();

  app.use(express.json());
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
    await closeQueueInfrastructure();
    await closeRedisConnection();
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
  }
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdownGracefully('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdownGracefully('SIGTERM');
});

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
