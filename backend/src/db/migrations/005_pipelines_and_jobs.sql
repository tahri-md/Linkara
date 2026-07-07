-- Pipeline Runs table
CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  trigger_type VARCHAR(50) NOT NULL,
  trigger_data JSONB,
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pipeline_runs_workflow_id_created_at ON pipeline_runs(workflow_id, created_at DESC);
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_org_id ON pipeline_runs(org_id);

-- Jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE NOT NULL,
  workflow_job_id VARCHAR(255),
  job_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
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

-- Job Logs table
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

-- Job Artifacts table
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

COMMENT ON TABLE pipeline_runs IS 'Individual executions of workflows';
COMMENT ON TABLE jobs IS 'Individual job executions within pipeline runs';
COMMENT ON TABLE job_logs IS 'Log output from job execution';
