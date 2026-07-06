// ─── Enums ───────────────────────────────────────────────────────────────────

import type { Job } from "./Job.js";

export type TriggerType = "manual" | "scheduled" | "webhook" | "api";

// ─── Core Workflow Definition (JSON Structure) ───────────────────────────────

export interface WorkflowStep {
  run: string;
}

export interface WorkflowJobDefinition {
  id: string;
  name: string;
  image: string;
  retry_count?: number;
  depends_on?: string[];
  steps: WorkflowStep[];
}

export interface WorkflowDefinition {
  jobs: Record<string, WorkflowJobDefinition>;
    repository: {
    url: string;      // e.g. https://github.com/org/repo.git
    ref?: string;     // default branch/tag, e.g. "main"
  };
}

// ─── Triggers ────────────────────────────────────────────────────────────────

export interface WorkflowTrigger {
  type: TriggerType;
  config?: Record<string, unknown>;
}

// ─── Database Entities ───────────────────────────────────────────────────────

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

// ─── Responses ───────────────────────────────────────────────────────────────

export interface WorkflowResponse extends Workflow {}

export interface WorkflowListResponse {
  data: WorkflowResponse[];
  total: number;
}
