-- Deployments table
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

COMMENT ON TABLE deployments IS 'Deployment records for tracking deployments across environments';
