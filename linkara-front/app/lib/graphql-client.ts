import { GraphQLClient, ClientError } from "graphql-request";

const DEFAULT_GRAPHQL_URL = "http://localhost:4000/graphql";
const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? DEFAULT_GRAPHQL_URL;

export type GraphQLVariables = Record<string, unknown>;

export interface GqlUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface AuthToken {
  token: string;
  user: GqlUser;
}

export interface GqlOrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  joined_at: string;
  user: GqlUser;
}

export interface GqlOrganization {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  owner_id: string;
  avatar_url: string | null;
  created_at: string;
  members: GqlOrganizationMember[];
}

export interface GqlWorkflowTrigger {
  type: "MANUAL" | "SCHEDULED" | "WEBHOOK" | "API";
  config: string | null;
}

export interface GqlWorkflowJobDefinition {
  id: string;
  name: string;
  image: string;
  depends_on: string[] | null;
  steps: Array<{ run: string }>;
}
export interface GqlWorkflowRepository {
  url: string;
  ref: string | null;
}

export interface GqlWorkflowDefinition {
  jobs: GqlWorkflowJobDefinition[];
  repository: GqlWorkflowRepository|null;
}

export interface GqlWorkflow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  definition: GqlWorkflowDefinition;
  triggers: GqlWorkflowTrigger[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GqlWorkflowListResponse {
  data: GqlWorkflow[];
  total: number;
}

export interface GqlJob {
  id: string;
  pipeline_run_id: string;
  workflow_job_id: string | null;
  job_name: string;
  status: string;
  docker_image: string | null;
  docker_container_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  exit_code: number | null;
  created_at: string;
}

export interface GqlPipelineRun {
  id: string;
  workflow_id: string;
  org_id: string;
  trigger_type: "MANUAL" | "SCHEDULED" | "WEBHOOK" | "API";
  triggered_by: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface GqlPipelineRunResponse extends GqlPipelineRun {
  jobs: GqlJob[];
}

export interface GqlPipelineRunListResponse {
  data: GqlPipelineRunResponse[];
  total: number;
}

export interface GqlCreateOrganizationInput {
  name: string;
  slug: string;
  description?: string;
  avatar_url?: string;
}

export interface GqlWorkflowStepInput {
  run: string;
}

export interface GqlWorkflowJobInput {
  id: string;
  name: string;
  image: string;
  depends_on?: string[];
  steps: GqlWorkflowStepInput[];
}

export interface GqlWorkflowTriggerInput {
  type: "MANUAL" | "SCHEDULED" | "WEBHOOK" | "API";
  config?: string | null;
}

export interface GqlCreateWorkflowInput {
  name: string;
  description?: string;
  definition: {
    jobs: GqlWorkflowJobInput[];
    repository: {
      url: string;
      ref?: string;
    };
  };
  triggers: GqlWorkflowTriggerInput[];
  is_active?: boolean;
}

export interface GraphQLResponse<TData> {
  data: TData;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("linkara_token");
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("linkara_token", token);
  document.cookie = `linkara_token=${encodeURIComponent(token)}; path=/; max-age=86400; samesite=lax`;
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem("linkara_token");
  document.cookie = "linkara_token=; path=/; max-age=0; samesite=lax";
}

export function createGraphQLClient(token?: string | null) {
  const client = new GraphQLClient(GRAPHQL_URL, {
    credentials: "include",
  });

  const authToken = token ?? getAuthToken();
  if (authToken) {
    client.setHeader("Authorization", `Bearer ${authToken}`);
  }

  return client;
}

export async function requestGraphQL<TData, TVariables extends GraphQLVariables = GraphQLVariables>(
  query: string,
  variables?: TVariables,
  token?: string | null,
): Promise<TData> {
  const client = createGraphQLClient(token);
  if (variables === undefined) {
    return (client.request as (document: string) => Promise<TData>)(query);
  }

  return (client.request as (document: string, variables: TVariables) => Promise<TData>)(query, variables);
}

export async function fetchMe(token?: string | null): Promise<{ me: GqlUser | null }> {
  return requestGraphQL<{ me: GqlUser | null }>(`
    query Me {
      me {
        id
        email
        name
        avatarUrl
        createdAt
      }
    }
  `, undefined, token);
}

export async function loginRequest(input: {
  email: string;
  password: string;
}): Promise<{ login: AuthToken }> {
  return requestGraphQL<{ login: AuthToken }>(`
    mutation Login($email: String!, $password: String!) {
      login(email: $email, password: $password) {
        token
        user {
          id
          email
          name
          avatarUrl
          createdAt
        }
      }
    }
  `, input);
}

export async function signupRequest(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ register: AuthToken }> {
  return requestGraphQL<{ register: AuthToken }>(`
    mutation Register($email: String!, $password: String!, $name: String) {
      register(email: $email, password: $password, name: $name) {
        token
        user {
          id
          email
          name
          avatarUrl
          createdAt
        }
      }
    }
  `, input);
}

export async function fetchOrganizations(token?: string | null): Promise<{ organizations: GqlOrganization[] }> {
  return requestGraphQL<{ organizations: GqlOrganization[] }>(`
    query Organizations {
      organizations {
        id
        name
        description
        slug
        owner_id
        avatar_url
        created_at
        members {
          id
          organization_id
          user_id
          role
          joined_at
          user {
            id
            email
            name
            avatarUrl
            createdAt
          }
        }
      }
    }
  `, undefined, token);
}

export async function fetchOrganization(token: string | null | undefined, id: string): Promise<{ organization: GqlOrganization | null }> {
  return requestGraphQL<{ organization: GqlOrganization | null }>(`
    query Organization($id: ID!) {
      organization(id: $id) {
        id
        name
        description
        slug
        owner_id
        avatar_url
        created_at
        members {
          id
          organization_id
          user_id
          role
          joined_at
          user {
            id
            email
            name
            avatarUrl
            createdAt
          }
        }
      }
    }
  `, { id }, token);
}

export async function createOrganization(
  token: string | null | undefined,
  input: GqlCreateOrganizationInput,
): Promise<{ createOrganization: GqlOrganization }> {
  return requestGraphQL<{ createOrganization: GqlOrganization }>(`
    mutation CreateOrganization($input: CreateOrganizationInput!) {
      createOrganization(input: $input) {
        id
        name
        description
        slug
        owner_id
        avatar_url
        created_at
        members {
          id
          organization_id
          user_id
          role
          joined_at
          user {
            id
            email
            name
            avatarUrl
            createdAt
          }
        }
      }
    }
  `, { input }, token);
}

export async function addOrganizationMember(
  token: string | null | undefined,
  input: {
    organizationId: string;
    userId: string;
    role: GqlOrganizationMember["role"];
  },
): Promise<{ addOrgMember: GqlOrganizationMember }> {
  return requestGraphQL<{ addOrgMember: GqlOrganizationMember }>(`
    mutation AddOrgMember($input: AddOrgMemberInput!) {
      addOrgMember(input: $input) {
        id
        organization_id
        user_id
        role
        joined_at
        user {
          id
          email
          name
          avatarUrl
          createdAt
        }
      }
    }
  `, { input }, token);
}

export async function updateOrganizationMemberRole(
  token: string | null | undefined,
  input: {
    organizationId: string;
    userId: string;
    role: GqlOrganizationMember["role"];
  },
): Promise<{ updateMemberRole: GqlOrganizationMember }> {
  return requestGraphQL<{ updateMemberRole: GqlOrganizationMember }>(`
    mutation UpdateMemberRole($input: UpdateMemberRoleInput!) {
      updateMemberRole(input: $input) {
        id
        organization_id
        user_id
        role
        joined_at
        user {
          id
          email
          name
          avatarUrl
          createdAt
        }
      }
    }
  `, { input }, token);
}

export async function removeOrganizationMember(
  token: string | null | undefined,
  organizationId: string,
  userId: string,
): Promise<{ removeMember: boolean }> {
  return requestGraphQL<{ removeMember: boolean }>(`
    mutation RemoveMember($organizationId: ID!, $userId: ID!) {
      removeMember(organizationId: $organizationId, userId: $userId)
    }
  `, { organizationId, userId }, token);
}

export async function fetchWorkflows(
  token: string | null | undefined,
  orgId: string,
  activeOnly = false,
  limit = 25,
  offset = 0,
): Promise<{ workflows: GqlWorkflowListResponse }> {
  return requestGraphQL<{ workflows: GqlWorkflowListResponse }>(`
    query Workflows($orgId: ID!, $activeOnly: Boolean, $limit: Int, $offset: Int) {
      workflows(orgId: $orgId, activeOnly: $activeOnly, limit: $limit, offset: $offset) {
        total
        data {
          id
          org_id
          name
          description
          definition {
            repository {
              url
              ref
            }
            jobs {
              id
              name
              image
              depends_on
              steps {
                run
              }
            }
          }
          triggers {
            type
            config
          }
          is_active
          created_by
          created_at
          updated_at
        }
      }
    }
  `, { orgId, activeOnly, limit, offset }, token);
}

export async function createWorkflow(
  token: string | null | undefined,
  orgId: string,
  input: GqlCreateWorkflowInput,
): Promise<{ createWorkflow: GqlWorkflow }> {
  return requestGraphQL<{ createWorkflow: GqlWorkflow }>(`
    mutation CreateWorkflow($orgId: ID!, $input: CreateWorkflowInput!) {
      createWorkflow(orgId: $orgId, input: $input) {
        id
        org_id
        name
        description
        definition {
         repository {
            url
            ref
          }
          jobs {
            id
            name
            image
            depends_on
            steps {
              run
            }
          }
        }
        triggers {
          type
          config
        }
        is_active
        created_by
        created_at
        updated_at
      }
    }
  `, { orgId, input }, token);
}

export async function fetchWorkflow(token: string | null | undefined, id: string): Promise<{ workflow: GqlWorkflow | null }> {
  return requestGraphQL<{ workflow: GqlWorkflow | null }>(`
    query Workflow($id: ID!) {
      workflow(id: $id) {
        id
        org_id
        name
        description
        definition {
         repository {
            url
            ref
          }
          jobs {
            id
            name
            image
            depends_on
            steps {
              run
            }
          }
        }
        triggers {
          type
          config
        }
        is_active
        created_by
        created_at
        updated_at
      }
    }
  `, { id }, token);
}

export async function fetchPipelineRuns(
  token: string | null | undefined,
  orgId: string,
  workflowId?: string,
  limit = 25,
  offset = 0,
): Promise<{ pipelineRuns: GqlPipelineRunListResponse }> {
  return requestGraphQL<{ pipelineRuns: GqlPipelineRunListResponse }>(`
    query PipelineRuns($orgId: ID!, $workflowId: ID, $limit: Int, $offset: Int) {
      pipelineRuns(orgId: $orgId, workflowId: $workflowId, limit: $limit, offset: $offset) {
        total
        data {
          id
          workflow_id
          org_id
          trigger_type
          triggered_by
          status
          started_at
          completed_at
          duration_seconds
          created_at
          jobs {
            id
            pipeline_run_id
            workflow_job_id
            job_name
            status
            docker_image
            docker_container_id
            started_at
            completed_at
            duration_seconds
            exit_code
            created_at
          }
        }
      }
    }
  `, { orgId, workflowId, limit, offset }, token);
}

export async function fetchPipelineRun(token: string | null | undefined, id: string): Promise<{ pipelineRun: GqlPipelineRunResponse | null }> {
  return requestGraphQL<{ pipelineRun: GqlPipelineRunResponse | null }>(`
    query PipelineRun($id: ID!) {
      pipelineRun(id: $id) {
        id
        workflow_id
        org_id
        trigger_type
        triggered_by
        status
        started_at
        completed_at
        duration_seconds
        created_at
        jobs {
          id
          pipeline_run_id
          workflow_job_id
          job_name
          status
          docker_image
          docker_container_id
          started_at
          completed_at
          duration_seconds
          exit_code
          created_at
        }
      }
    }
  `, { id }, token);
}

export async function fetchJobsByPipelineRun(
  token: string | null | undefined,
  pipelineRunId: string,
): Promise<{ jobsByPipelineRun: GqlJob[] }> {
  return requestGraphQL<{ jobsByPipelineRun: GqlJob[] }>(`
    query JobsByPipelineRun($pipelineRunId: ID!) {
      jobsByPipelineRun(pipelineRunId: $pipelineRunId) {
        id
        pipeline_run_id
        workflow_job_id
        job_name
        status
        docker_image
        docker_container_id
        started_at
        completed_at
        duration_seconds
        exit_code
        created_at
      }
    }
  `, { pipelineRunId }, token);
}

export interface GqlTriggerPipelineRunInput {
  workflowId: string;
  trigger_type: "MANUAL" | "SCHEDULED" | "WEBHOOK" | "API";
  manual?: {
    user_id?: string;
  };
  webhook?: {
    repo: string;
    event: string;
    payload_id?: string;
  };
  scheduled?: {
    cron: string;
  };
  api?: {
    api_key?: string;
    source?: string;
  };
}

export async function triggerPipelineRun(
  token: string | null | undefined,
  orgId: string,
  input: GqlTriggerPipelineRunInput,
): Promise<{ triggerPipelineRun: GqlPipelineRunResponse }> {
  return requestGraphQL<{ triggerPipelineRun: GqlPipelineRunResponse }>(`
    mutation TriggerPipelineRun($orgId: ID!, $input: TriggerPipelineRunInput!) {
      triggerPipelineRun(orgId: $orgId, input: $input) {
        id
        workflow_id
        org_id
        trigger_type
        triggered_by
        status
        started_at
        completed_at
        duration_seconds
        created_at
        jobs {
          id
          pipeline_run_id
          workflow_job_id
          job_name
          status
          docker_image
          docker_container_id
          started_at
          completed_at
          duration_seconds
          exit_code
          created_at
        }
      }
    }
  `, { orgId, input }, token);
}

export async function updateWorkflow(
  token: string | null | undefined,
  workflowId: string,
  orgId: string,
  input: Partial<GqlCreateWorkflowInput>,
): Promise<{ updateWorkflow: GqlWorkflow }> {
  return requestGraphQL<{ updateWorkflow: GqlWorkflow }>(`
    mutation UpdateWorkflow($id: ID!, $orgId: ID!, $input: UpdateWorkflowInput!) {
      updateWorkflow(id: $id, orgId: $orgId, input: $input) {
        id
        org_id
        name
        description
        definition {
          jobs {
            id
            name
            image
            depends_on
            steps {
              run
            }
          }
        }
        triggers {
          type
          config
        }
        is_active
        created_by
        created_at
        updated_at
      }
    }
  `, { id: workflowId, orgId, input }, token);
}

export async function deleteWorkflow(
  token: string | null | undefined,
  workflowId: string,
  orgId: string,
  hardDelete = false,
): Promise<{ deleteWorkflow: boolean }> {
  return requestGraphQL<{ deleteWorkflow: boolean }>(`
    mutation DeleteWorkflow($id: ID!, $orgId: ID!, $hardDelete: Boolean) {
      deleteWorkflow(id: $id, orgId: $orgId, hardDelete: $hardDelete)
    }
  `, { id: workflowId, orgId, hardDelete }, token);
}

export async function restoreWorkflow(
  token: string | null | undefined,
  workflowId: string,
  orgId: string,
): Promise<{ restoreWorkflow: GqlWorkflow }> {
  return requestGraphQL<{ restoreWorkflow: GqlWorkflow }>(`
    mutation RestoreWorkflow($id: ID!, $orgId: ID!) {
      restoreWorkflow(id: $id, orgId: $orgId) {
        id
        org_id
        name
        description
        definition {
          jobs {
            id
            name
            image
            depends_on
            steps {
              run
            }
          }
        }
        triggers {
          type
          config
        }
        is_active
        created_by
        created_at
        updated_at
      }
    }
  `, { id: workflowId, orgId }, token);
}

export function isGraphQLError(error: unknown): error is ClientError {
  return error instanceof ClientError;
}

export type GqlLogLevel = "INFO" | "WARNING" | "ERROR" | "DEBUG";

export interface GqlJobLog {
  id: string;
  line_number: number | null;
  timestamp: string;
  level: GqlLogLevel;
  message: string;
}
export async function fetchJobLogs(
  token: string | null,
  jobId: string,
): Promise<{ jobLogs: GqlJobLog[] }> {
  return requestGraphQL<{ jobLogs: GqlJobLog[] }>(
    `
    query JobLogs($jobId: ID!) {
      jobLogs(jobId: $jobId) {
        id
        line_number
        timestamp
        level
        message
      }
    }
  `,
    { jobId },
    token,
  );
}

export interface GqlJobArtifact {
  id: string;
  job_id: string;
  name: string;
  file_size_bytes: number;
  s3_url: string | null;
  uploaded_at: string;
}

export async function fetchJobArtifacts(
  token: string | null,
  jobId: string,
): Promise<{ jobArtifacts: GqlJobArtifact[] }> {
  return requestGraphQL<{ jobArtifacts: GqlJobArtifact[] }>(
    `
    query JobArtifacts($jobId: ID!) {
      jobArtifacts(jobId: $jobId) {
        id
        name
        file_size_bytes
        s3_url
        uploaded_at
      }
    }
  `,
    { jobId },
    token,
  );
}

export type GqlWebhookProvider = "github" | "gitlab" | "bitbucket";

export interface GqlWebhook {
  id: string;
  org_id: string;
  workflow_id: string;
  provider: GqlWebhookProvider;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export async function fetchWebhooks(
  token: string | null,
  orgId: string,
): Promise<{ webhooks: { data: GqlWebhook[]; total: number } }> {
  return requestGraphQL(
    `
    query Webhooks($orgId: ID!) {
      webhooks(orgId: $orgId) {
        data { id org_id workflow_id provider url secret events active createdAt }
        total
      }
    }
  `,
    { orgId },
    token,
  );
}

export async function createWebhook(
  token: string | null,
  input: { org_id: string; workflow_id: string; provider: GqlWebhookProvider; events: string[] },
): Promise<{ createWebhook: GqlWebhook }> {
  return requestGraphQL(
    `
    mutation CreateWebhook($input: CreateWebhookInput!) {
      createWebhook(input: $input) {
        id org_id workflow_id provider url secret events active createdAt
      }
    }
  `,
    { input },
    token,
  );
}

export async function deleteWebhook(
  token: string | null,
  id: string,
): Promise<{ deleteWebhook: boolean }> {
  return requestGraphQL(
    `mutation DeleteWebhook($id: ID!) { deleteWebhook(id: $id) }`,
    { id },
    token,
  );
}

export type GqlNotifyOn = "all" | "failure_only";

export interface GqlNotificationPreference {
  id: string;
  userId: string;
  orgId: string;
  emailOnSuccess: boolean;
  emailOnFailure: boolean;
  slackWebhookUrl: string | null;
  teamsWebhookUrl: string | null;
  notifyOn: GqlNotifyOn;
}

export async function fetchNotificationPreferences(
  token: string | null,
  orgId: string,
): Promise<{ notificationPreferences: GqlNotificationPreference | null }> {
  return requestGraphQL(
    `
    query NotificationPreferences($orgId: ID!) {
      notificationPreferences(orgId: $orgId) {
        id userId orgId emailOnSuccess emailOnFailure
        slackWebhookUrl teamsWebhookUrl notifyOn
      }
    }
  `,
    { orgId },
    token,
  );
}

export async function setNotificationPreferences(
  token: string | null,
  orgId: string,
  preferences: {
    emailOnSuccess: boolean;
    emailOnFailure: boolean;
    slackWebhookUrl?: string;
    teamsWebhookUrl?: string;
    notifyOn: GqlNotifyOn;
  },
): Promise<{ setNotificationPreferences: GqlNotificationPreference }> {
  return requestGraphQL(
    `
    mutation SetNotificationPreferences($orgId: ID!, $preferences: NotificationPreferenceInput!) {
      setNotificationPreferences(orgId: $orgId, preferences: $preferences) {
        id userId orgId emailOnSuccess emailOnFailure
        slackWebhookUrl teamsWebhookUrl notifyOn
      }
    }
  `,
    { orgId, preferences },
    token,
  );
}

export async function sendTestNotification(
  token: string | null,
  orgId: string,
  type: "email" | "slack" | "teams",
): Promise<{ sendTestNotification: boolean }> {
  return requestGraphQL(
    `
    mutation SendTestNotification($orgId: ID!, $type: NotificationType!) {
      sendTestNotification(orgId: $orgId, type: $type)
    }
  `,
    { orgId, type },
    token,
  );
}