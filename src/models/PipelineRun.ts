import { Job } from "./Job";

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


export interface TriggerPipelineRunInput {
  trigger_type: TriggerType;
  trigger_data?: Record<string, unknown>;
}

export interface PipelineRunResponse extends PipelineRun {
  jobs: Job[];
}

export interface PipelineRunListResponse {
  data: PipelineRunResponse[];
  total: number;
}