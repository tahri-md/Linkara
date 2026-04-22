import express from 'express';
import { createApolloServer, createApolloMiddleware } from './config/apollo.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers/index.js';
import { authMiddleware } from './middleware/auth.js';
import { testConnection } from './db/connection.js';

const PORT = process.env.PORT || 4000;

async function startServer() {
  const app = express();

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

  app.listen(PORT, async () => {
    const dbConnected = await testConnection();
    if (dbConnected) {
      console.log(`Server started on http://localhost:${PORT}/graphql`);
      console.log('Database connected');
    } else {
      console.warn('Warning: Database connection failed');
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
