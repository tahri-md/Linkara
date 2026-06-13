import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const userSchema = readFileSync(resolve(__dirname, './types/user.graphql'), 'utf-8');
const organizationSchema = readFileSync(resolve(__dirname, './types/organization.graphql'), 'utf-8');
const workflowSchema = readFileSync(resolve(__dirname, './types/workflow.graphql'), 'utf-8');
const jobSchema = readFileSync(resolve(__dirname, './types/job.graphql'), 'utf-8');
const secretsSchema = readFileSync(resolve(__dirname, './types/secrets.graphql'), 'utf-8');
const pipelineRunSchema = readFileSync(resolve(__dirname, './types/pipelineRun.graphql'), 'utf-8');
const notificationSchema = readFileSync(resolve(__dirname, './types/notification.graphql'), 'utf-8');
const webhooksSchema = readFileSync(resolve(__dirname, './types/webhooks.graphql'), 'utf-8');
const rbacSchema = readFileSync(resolve(__dirname, './types/rbac.graphql'), 'utf-8');

export const typeDefs = `
  ${userSchema}
  ${organizationSchema}
  ${workflowSchema}
  ${jobSchema}
  ${secretsSchema}
  ${pipelineRunSchema}
  ${webhooksSchema}
  ${notificationSchema}
  ${rbacSchema}


`;

export interface Context {
  userId?: string;
}
