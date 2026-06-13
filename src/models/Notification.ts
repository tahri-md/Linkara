export interface NotificationPreference {
  id: string;
  user_id: string;
  org_id: string;
  email_on_success: boolean;
  email_on_failure: boolean;
  slack_webhook_url?: string;
  teams_webhook_url?: string;
  notify_on: 'all' | 'failure_only';
  created_at: Date;
  updated_at: Date;
}

export interface NotificationLog {
  id: string;
  user_id: string;
  job_id: string;
  notification_type: 'email' | 'slack' | 'teams';
  status: 'sent' | 'failed';
  sent_at: Date;
  error_message?: string;
}

export interface SlackMessage {
  text: string;
  blocks?: {
    type: string;
    text?: {
      type: string;
      text: string;
    };
    fields?: {
      type: string;
      text: string;
    }[];
  }[];
  attachments?: {
    color: string;
    title: string;
    fields: {
      title: string;
      value: string;
      short: boolean;
    }[];
  }[];
}

export interface TeamsMessage {
  '@type': string;
  '@context': string;
  summary: string;
  sections: {
    activityTitle: string;
    activitySubtitle: string;
    facts: {
      name: string;
      value: string;
    }[];
  }[];
  themeColor: string;
}

export interface NotificationInput {
  email_on_success: boolean;
  email_on_failure: boolean;
  slack_webhook_url?: string;
  teams_webhook_url?: string;
  notify_on: 'all' | 'failure_only';
}