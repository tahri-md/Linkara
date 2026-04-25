import { authResolvers } from './auth.js';
import { organizationResolvers } from './organization.js';
import { workflowResolvers } from './workflow.js';
import { jobResolvers } from './job.js';

export const resolvers = {
  Query: {
    ...authResolvers.Query,
    ...organizationResolvers.Query,
    ...workflowResolvers.Query,
    ...jobResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...organizationResolvers.Mutation,
    ...workflowResolvers.Mutation,
  },
  Organization: organizationResolvers.Organization,
};
