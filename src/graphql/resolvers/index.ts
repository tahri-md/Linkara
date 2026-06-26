import { authResolvers } from './auth.js';
import { organizationResolvers } from './organization.js';
import { workflowResolvers } from './workflow.js';
import { jobResolvers } from './job.js';
import { pipelineResolvers } from './pipeline.js';
import { secretsResolvers } from './secrets.js';
import { webhookResolvers } from './webhook.js';
import { notificationResolvers } from './notification.js';
import { rbacResolvers } from './rbac.js';
import { tenancyResolvers } from './tenancy.js';

export const resolvers = {
  Query: {
    ...authResolvers.Query,
    ...webhookResolvers.Query,
    ...organizationResolvers.Query,
    ...workflowResolvers.Query,
    ...jobResolvers.Query,
    ...pipelineResolvers.Query,
    ...secretsResolvers.Query,
    ...notificationResolvers.Query,
    ...rbacResolvers.Query,
    ...tenancyResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...webhookResolvers.Mutation,
    ...organizationResolvers.Mutation,
    ...workflowResolvers.Mutation,
    ...pipelineResolvers.Mutation,
    ...secretsResolvers.Mutation,
    ...notificationResolvers.Mutation,
    ...rbacResolvers.Mutation,
    ...tenancyResolvers.Mutation,
  },
  User: authResolvers.User,
  Job: jobResolvers.Job,
  Workflow: workflowResolvers.Workflow,
  WorkflowDefinition: workflowResolvers.WorkflowDefinition,
  WorkflowTrigger: workflowResolvers.WorkflowTrigger,
  Organization: organizationResolvers.Organization,
  PipelineRun: pipelineResolvers.PipelineRun,
  Webhook: webhookResolvers.Webhook,
};