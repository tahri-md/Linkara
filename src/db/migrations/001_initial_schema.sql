-- Create ENUM types first
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
CREATE TYPE trigger_type AS ENUM ('github', 'manual', 'scheduled');
CREATE TYPE pipeline_run_status AS ENUM ('pending', 'running', 'success', 'failure', 'cancelled');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'success', 'failure', 'skipped', 'cancelled');
CREATE TYPE log_level AS ENUM ('info', 'warning', 'error', 'debug');
CREATE TYPE deployment_target_type AS ENUM ('aws', 'heroku', 'kubernetes', 'ssh', 'custom');
CREATE TYPE deployment_status AS ENUM ('pending', 'deploying', 'success', 'failure', 'rolled_back');
CREATE TYPE integration_type AS ENUM ('github', 'gitlab', 'bitbucket', 'custom');
CREATE TYPE notification_type AS ENUM ('slack', 'email', 'webhook');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

-- 1. Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  avatar_url VARCHAR(500),
  github_id VARCHAR(255),
  github_token VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_github_id ON users(github_id);

-- 2. Organizations Table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  avatar_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_organizations_owner_id ON organizations(owner_id);
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- 3. Organization Members Table
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  role org_role DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org_id ON org_members(org_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);

-- 4. Workflows Table
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  definition JSONB NOT NULL,
  triggers JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, name)
);

CREATE INDEX idx_workflows_org_id ON workflows(org_id);
CREATE INDEX idx_workflows_created_by ON workflows(created_by);
CREATE INDEX idx_workflows_is_active ON workflows(is_active);

-- 5. Pipeline Runs Table
CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  trigger_type trigger_type NOT NULL,
  trigger_data JSONB,
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status pipeline_run_status DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pipeline_runs_workflow_id_created_at ON pipeline_runs(workflow_id, created_at DESC);
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_org_id ON pipeline_runs(org_id);

-- 6. Jobs Table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE NOT NULL,
  workflow_job_id VARCHAR(255),
  job_name VARCHAR(255) NOT NULL,
  status job_status DEFAULT 'pending',
  docker_image VARCHAR(255),
  docker_container_id VARCHAR(255),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  retry_count INTEGER DEFAULT 0,
  exit_code INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_pipeline_run_id ON jobs(pipeline_run_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_docker_container_id ON jobs(docker_container_id);

-- 7. Job Logs Table
CREATE TABLE job_logs (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  line_number INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  level log_level DEFAULT 'info',
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_job_logs_job_id_line_number ON job_logs(job_id, line_number);
CREATE INDEX idx_job_logs_created_at ON job_logs(created_at);

-- 8. Job Artifacts Table
CREATE TABLE job_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255),
  file_path VARCHAR(500),
  file_size_bytes BIGINT,
  s3_url VARCHAR(500),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_job_artifacts_job_id ON job_artifacts(job_id);

-- 9. Secrets Table (for encrypted storage)
CREATE TABLE secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accessed_at TIMESTAMP,
  UNIQUE(org_id, name)
);

CREATE INDEX idx_secrets_org_id ON secrets(org_id);
CREATE INDEX idx_secrets_accessed_at ON secrets(accessed_at);

-- 10. Deployments Table
CREATE TABLE deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  pipeline_run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  target_type deployment_target_type NOT NULL,
  target_name VARCHAR(255),
  environment VARCHAR(100),
  status deployment_status DEFAULT 'pending',
  deployed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deployed_at TIMESTAMP,
  previous_deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  rollback_from_deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deployments_org_id_created_at ON deployments(org_id, created_at DESC);
CREATE INDEX idx_deployments_pipeline_run_id ON deployments(pipeline_run_id);
CREATE INDEX idx_deployments_status ON deployments(status);

-- 11. Webhook Integrations Table
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

-- 12. Notifications Table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  pipeline_run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  channel VARCHAR(255),
  status notification_status DEFAULT 'pending',
  payload JSONB,
  error_message TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_org_id_created_at ON notifications(org_id, created_at DESC);
CREATE INDEX idx_notifications_status ON notifications(status);

-- 13. Audit Logs Table
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 14. Weebhooks
CREATE TABLE webhooks (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations(id),
  workflow_id UUID REFERENCES workflows(id),
  provider VARCHAR(50), -- github, gitlab, bitbucket
  url VARCHAR(500), -- webhook URL
  secret VARCHAR(256), -- HMAC secret
  events TEXT[], -- array of events to listen for
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY,
  webhook_id UUID REFERENCES webhooks(id),
  event_type VARCHAR(100),
  payload JSONB,
  delivered_at TIMESTAMP,
  status VARCHAR(20) -- success, failed
);

-- Notification Preferences Table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_on_success BOOLEAN DEFAULT false,
  email_on_failure BOOLEAN DEFAULT true,
  slack_webhook_url VARCHAR(500),
  teams_webhook_url VARCHAR(500),
  notify_on VARCHAR(50) DEFAULT 'failure_only', -- 'all' or 'failure_only'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_org_id ON notification_preferences(org_id);

-- Notification Logs Table
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL, -- 'email', 'slack', 'teams'
  status VARCHAR(20) NOT NULL DEFAULT 'sent', -- 'sent', 'failed'
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  error_message TEXT
);
-- Create roles table
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_predefined BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, name)
);

-- Create role_permissions table (junction table)
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(role_id, permission)
);

-- Create member_roles table (junction table for users to roles)
CREATE TABLE member_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id, role_id)
);

-- Create tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  level VARCHAR(50) NOT NULL CHECK (level IN ('organization', 'workspace', 'team', 'project')),
  parent_tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create tenant members table
CREATE TABLE tenant_members (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(100) NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- Create tenant isolation configs table
CREATE TABLE tenant_isolation_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  data_isolation VARCHAR(50) NOT NULL DEFAULT 'strict' CHECK (data_isolation IN ('strict', 'shared', 'hybrid')),
  resource_sharing BOOLEAN NOT NULL DEFAULT false,
  cross_tenant_access BOOLEAN NOT NULL DEFAULT false,
  custom_metadata BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create tenant quotas table
CREATE TABLE tenant_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  max_users INTEGER NOT NULL DEFAULT 50,
  max_workflows INTEGER NOT NULL DEFAULT 100,
  max_jobs INTEGER NOT NULL DEFAULT 1000,
  max_storage BIGINT NOT NULL DEFAULT 10737418240,
  max_webhooks INTEGER NOT NULL DEFAULT 50,
  storage_used BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_tenants_parent_tenant_id ON tenants(parent_tenant_id);
CREATE INDEX idx_tenants_level ON tenants(level);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenant_members_tenant_id ON tenant_members(tenant_id);
CREATE INDEX idx_tenant_members_user_id ON tenant_members(user_id);
CREATE INDEX idx_tenant_isolation_configs_tenant_id ON tenant_isolation_configs(tenant_id);
CREATE INDEX idx_tenant_quotas_tenant_id ON tenant_quotas(tenant_id);

-- Add comment documenting the schema
COMMENT ON TABLE tenants IS 'Multi-level tenant hierarchy supporting organization > workspace > team > project';
COMMENT ON TABLE tenant_members IS 'Tracks user memberships in tenants with role assignments';
COMMENT ON TABLE tenant_isolation_configs IS 'Isolation and access control configuration for each tenant';
COMMENT ON TABLE tenant_quotas IS 'Resource quotas and usage tracking for each tenant';


-- Create indexes for performance
CREATE INDEX idx_roles_org_id ON roles(org_id);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_member_roles_org_id ON member_roles(org_id);
CREATE INDEX idx_member_roles_user_id ON member_roles(user_id);
CREATE INDEX idx_member_roles_role_id ON member_roles(role_id);
CREATE INDEX idx_member_roles_user_org ON member_roles(user_id, org_id);



CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_job_id ON notification_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON notification_logs(sent_at DESC);


CREATE INDEX idx_audit_logs_org_id_created_at ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);

-- Add comment about the schema
COMMENT ON TABLE users IS 'System users with authentication credentials';
COMMENT ON TABLE organizations IS 'Organizations that contain workflows and users';
COMMENT ON TABLE workflows IS 'CI/CD workflow definitions';
COMMENT ON TABLE pipeline_runs IS 'Individual executions of workflows';
COMMENT ON TABLE jobs IS 'Individual job executions within pipeline runs';
COMMENT ON TABLE job_logs IS 'Log output from job execution';
COMMENT ON TABLE secrets IS 'Encrypted secrets for job execution';
COMMENT ON TABLE deployments IS 'Deployment records for tracking deployments across environments';
COMMENT ON TABLE audit_logs IS 'Audit trail of all system actions for compliance';

