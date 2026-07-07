-- ENUM types
CREATE TYPE org_role AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
CREATE TYPE trigger_type AS ENUM ('MANUAL', 'SCHEDULED', 'WEBHOOK', 'API', 'github');
CREATE TYPE pipeline_run_status AS ENUM ('pending', 'running', 'success', 'failed', 'cancelled');
CREATE TYPE job_status AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');
CREATE TYPE log_level AS ENUM ('info', 'warning', 'error', 'debug');
CREATE TYPE deployment_target_type AS ENUM ('aws', 'heroku', 'kubernetes', 'ssh', 'custom');
CREATE TYPE deployment_status AS ENUM ('pending', 'deploying', 'success', 'failure', 'rolled_back');
CREATE TYPE integration_type AS ENUM ('github', 'gitlab', 'bitbucket', 'custom');
CREATE TYPE notification_type AS ENUM ('slack', 'email', 'webhook');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
