-- Webhooks table
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  workflow_id UUID REFERENCES workflows(id),
  provider VARCHAR(50),
  url VARCHAR(500),
  secret VARCHAR(256),
  events TEXT[],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhook Events table
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhooks(id),
  event_type VARCHAR(100),
  payload JSONB,
  delivered_at TIMESTAMP,
  status VARCHAR(20)
);

-- Webhook Integrations table
CREATE TABLE webhook_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  integration_type integration_type NOT NULL,
  webhook_secret VARCHAR(500),
  webhook_url VARCHAR(500),
  events JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_integrations_org_id ON webhook_integrations(org_id);
CREATE INDEX idx_webhook_integrations_workflow_id ON webhook_integrations(workflow_id);
