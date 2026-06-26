// ===============================
// Enums
// ===============================

export type WebhookProvider = "github" | "gitlab" | "bitbucket";

export type WebhookEventStatus = "success" | "failed";

// ===============================
// Core Models
// ===============================

export interface Webhook {
  id: string;

  org_id: string;
  workflow_id: string;

  provider: WebhookProvider;
  url: string;

  secret: string;

  events: string[];

  active: boolean;

  created_at: Date;
  updated_at: Date | null;
}

export interface WebhookEvent {
  id: string;

  webhook_id: string;

  event_type: string;

  payload: Record<string, unknown> | null;

  delivered_at: Date | null;

  status: WebhookEventStatus;

  created_at: Date;
}

// ===============================
// Inputs (API Layer)
// ===============================

export interface CreateWebhookInput {
  org_id: string;
  workflow_id: string;

  provider: WebhookProvider;
  url: string;

  secret: string;

  events: string[];

  active?: boolean;
}

export interface UpdateWebhookInput {
  url?: string;
  secret?: string;
  events?: string[];
  active?: boolean;
}

export interface CreateWebhookEventInput {
  webhook_id: string;

  event_type: string;

  payload: Record<string, unknown>;

  delivered_at?: Date;

  status: WebhookEventStatus;
}

// ===============================
// Responses
// ===============================

export interface WebhookListResponse {
  data: Webhook[];
  total: number;
}

export interface WebhookEventListResponse {
  data: WebhookEvent[];
  total: number;
}

// ===============================
// Runtime / Execution Types
// ===============================

export interface IncomingWebhookPayload {
  provider: WebhookProvider;

  event_type: string;

  headers: Record<string, string>;

  body: Record<string, unknown>;

  received_at: Date;
}

export interface WebhookTriggerContext {
  webhook: Webhook;

  event_type: string;

  payload: Record<string, unknown>;

  received_at: Date;

  signature_valid: boolean;
}
