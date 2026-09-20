import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import type { GraphQLFormattedError } from "graphql";

export function createApolloServer(typeDefs: string, resolvers: any) {
  const server = new ApolloServer<any>({
    typeDefs,
    resolvers,
    formatError: (formattedError: GraphQLFormattedError) => {
      console.error("GraphQL Error:", formattedError.message);
      return formattedError;
    },
  });

  return server;
}

export function createApolloMiddleware(server: ApolloServer<any>) {
  return expressMiddleware(server, {
    context: async ({ req }) => ({
      userId: (req as any).userId,
      req,
    }),
  });
}
