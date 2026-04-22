import { authResolvers } from './auth.js';
import { organizationResolvers } from './organization.js';

export const resolvers = {
  Query: {
    ...authResolvers.Query,
    ...organizationResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...organizationResolvers.Mutation,
  },
  Organization: organizationResolvers.Organization,
};
