-- Notifications table
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

-- Notification Preferences table
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_on_success BOOLEAN DEFAULT false,
  email_on_failure BOOLEAN DEFAULT true,
  slack_webhook_url VARCHAR(500),
  teams_webhook_url VARCHAR(500),
  notify_on VARCHAR(50) DEFAULT 'failure_only',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, org_id)
);

CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX idx_notification_preferences_org_id ON notification_preferences(org_id);

-- Notification Logs table
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  error_message TEXT
);

CREATE INDEX idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX idx_notification_logs_job_id ON notification_logs(job_id);
CREATE INDEX idx_notification_logs_sent_at ON notification_logs(sent_at DESC);
