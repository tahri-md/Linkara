// ─── Enums ───────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

export type TriggerType =
  | 'manual'
  | 'scheduled'
  | 'webhook'
  | 'api';

export type PipelineRunStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';


// ─── Core Workflow Definition (JSON Structure) ───────────────────────────────

export interface WorkflowStep {
  run: string;
}

export interface WorkflowJobDefinition {
  id: string;
  name: string;
  image: string;
  depends_on?: string[];
  steps: WorkflowStep[];
}

export interface WorkflowDefinition {
  jobs: Record<string, WorkflowJobDefinition>;
}


// ─── Triggers ────────────────────────────────────────────────────────────────

export interface WorkflowTrigger {
  type: TriggerType;
  config?: Record<string, unknown>;
}


// ─── Database Entities ───────────────────────────────────────────────────────

export interface Job {
  id: string;
  pipeline_run_id: string;
  workflow_job_id: string | null;
  job_name: string;

  status: JobStatus;

  docker_image: string | null;
  docker_container_id: string | null;

  started_at: Date | null;
  completed_at: Date | null;
  duration_seconds: number | null;
  exit_code: number | null;

  created_at: Date;
}

export interface Workflow {
  id: string;
  org_id: string;

  name: string;
  description: string | null;

  definition: WorkflowDefinition;
  triggers: WorkflowTrigger[];

  is_active: boolean;

  created_by: string | null;

  created_at: Date;
  updated_at: Date;
}

export interface PipelineRun {
  id: string;
  workflow_id: string;
  org_id: string;

  trigger_type: TriggerType;
  trigger_data: Record<string, unknown> | null;
  triggered_by: string | null;

  status: PipelineRunStatus;

  started_at: Date | null;
  completed_at: Date | null;
  duration_seconds: number | null;

  created_at: Date;
}


// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface CreateWorkflowInput {
  name: string;
  description?: string;

  definition: WorkflowDefinition;

  triggers: WorkflowTrigger[];
  is_active?: boolean;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;

  definition?: WorkflowDefinition;

  triggers?: WorkflowTrigger[];
  is_active?: boolean;
}

export interface TriggerPipelineRunInput {
  trigger_type: TriggerType;
  trigger_data?: Record<string, unknown>;
}


// ─── Responses ───────────────────────────────────────────────────────────────

export interface WorkflowResponse extends Workflow {}

export interface WorkflowListResponse {
  data: WorkflowResponse[];
  total: number;
}

export interface PipelineRunResponse extends PipelineRun {
  jobs: Job[];
}

export interface PipelineRunListResponse {
  data: PipelineRunResponse[];
  total: number;
}