import { authResolvers } from './auth.js';
import { organizationResolvers } from './organization.js';
import { workflowResolvers } from './workflow.js';
import { jobResolvers } from './job.js';
import { pipelineResolvers } from './pipeline.js';

export const resolvers = {
  Query: {
    ...authResolvers.Query,
    ...organizationResolvers.Query,
    ...workflowResolvers.Query,
    ...jobResolvers.Query,
    ...pipelineResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...organizationResolvers.Mutation,
    ...workflowResolvers.Mutation,
    ...pipelineResolvers.Mutation,
  },
  Organization: organizationResolvers.Organization,
  PipelineRun: pipelineResolvers.PipelineRun,
};
