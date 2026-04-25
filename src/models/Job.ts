export type JobStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

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

