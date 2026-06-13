import { notificationService } from '../../services/NotificationService.js';
import { query } from '../../db/connection.js';
import type { NotificationPreference } from '../../models/Notification.js';

interface Context {
  userId?: string;
}

interface SetNotificationPreferencesArgs {
  orgId: string;
  preferences: {
    emailOnSuccess: boolean;
    emailOnFailure: boolean;
    slackWebhookUrl?: string;
    teamsWebhookUrl?: string;
    notifyOn: 'all' | 'failure_only';
  };
}

interface NotificationPreferencesArgs {
  orgId: string;
}

interface SendTestNotificationArgs {
  orgId: string;
  type: 'email' | 'slack' | 'teams';
}

async function userCanAccessOrganization(userId: string, orgId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM org_members WHERE user_id = $1 AND org_id = $2 LIMIT 1`,
    [userId, orgId]
  );

  return result.rows.length > 0;
}

async function getUserEmailFromOrgId(userId: string, orgId: string): Promise<string | null> {
  const result = await query(
    `SELECT u.email FROM users u
     WHERE u.id = $1 LIMIT 1`,
    [userId]
  );

  return result.rows.length > 0 ? result.rows[0].email : null;
}

function convertFromGraphQL(preferences: SetNotificationPreferencesArgs['preferences']) {
  return {
    email_on_success: preferences.emailOnSuccess,
    email_on_failure: preferences.emailOnFailure,
    slack_webhook_url: preferences.slackWebhookUrl,
    teams_webhook_url: preferences.teamsWebhookUrl,
    notify_on: preferences.notifyOn,
  };
}

function convertToGraphQL(prefs: NotificationPreference) {
  return {
    id: prefs.id,
    userId: prefs.user_id,
    orgId: prefs.org_id,
    emailOnSuccess: prefs.email_on_success,
    emailOnFailure: prefs.email_on_failure,
    slackWebhookUrl: prefs.slack_webhook_url,
    teamsWebhookUrl: prefs.teams_webhook_url,
    notifyOn: prefs.notify_on,
    createdAt: prefs.created_at.toISOString(),
    updatedAt: prefs.updated_at.toISOString(),
  };
}

export const notificationResolvers = {
  Query: {
    async notificationPreferences(
      _: unknown,
      args: NotificationPreferencesArgs,
      context: Context
    ): Promise<any> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const canAccess = await userCanAccessOrganization(context.userId, args.orgId);
      if (!canAccess) {
        throw new Error('You do not have permission to access this organization');
      }

      const prefs = await notificationService.getNotificationPreferences(
        context.userId,
        args.orgId
      );

      return prefs ? convertToGraphQL(prefs) : null;
    },
  },

  Mutation: {
    async setNotificationPreferences(
      _: unknown,
      args: SetNotificationPreferencesArgs,
      context: Context
    ): Promise<any> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const canAccess = await userCanAccessOrganization(context.userId, args.orgId);
      if (!canAccess) {
        throw new Error('You do not have permission to access this organization');
      }

      const converted = convertFromGraphQL(args.preferences);
      const prefs = await notificationService.setNotificationPreferences(
        context.userId,
        args.orgId,
        converted
      );

      return convertToGraphQL(prefs);
    },

    async sendTestNotification(
      _: unknown,
      args: SendTestNotificationArgs,
      context: Context
    ): Promise<boolean> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const canAccess = await userCanAccessOrganization(context.userId, args.orgId);
      if (!canAccess) {
        throw new Error('You do not have permission to access this organization');
      }

      try {
        const prefs = await notificationService.getNotificationPreferences(
          context.userId,
          args.orgId
        );

        if (!prefs) {
          throw new Error('No notification preferences configured');
        }

        const email = await getUserEmailFromOrgId(context.userId, args.orgId);

        if (args.type === 'email') {
          if (!email) {
            throw new Error('User email not found');
          }
          await notificationService.sendEmailNotification(
            context.userId,
            'Test Notification - Linkara',
            'pipeline_success',
            {
              pipelineRunId: 'test-run-123',
              workflowName: 'Test Workflow',
              status: 'success',
              duration: 42,
            }
          );
        } else if (args.type === 'slack') {
          if (!prefs.slack_webhook_url) {
            throw new Error('Slack webhook URL not configured');
          }
          const slackMessage = {
            text: '✅ Test Notification',
            attachments: [
              {
                color: '#36a64f',
                title: 'Test Slack Notification',
                fields: [
                  { title: 'Status', value: 'SUCCESS', short: true },
                  { title: 'Type', value: 'Test', short: true },
                ],
              },
            ],
          };
          await notificationService.sendSlackNotification(
            prefs.slack_webhook_url,
            slackMessage
          );
        } else if (args.type === 'teams') {
          if (!prefs.teams_webhook_url) {
            throw new Error('Teams webhook URL not configured');
          }
          const teamsMessage = {
            '@type': 'MessageCard',
            '@context': 'https://schema.org/extensions',
            summary: '✅ Test Notification',
            sections: [
              {
                activityTitle: 'Test Teams Notification',
                activitySubtitle: 'Linkara Platform',
                facts: [
                  { name: 'Status', value: 'SUCCESS' },
                  { name: 'Type', value: 'Test' },
                ],
              },
            ],
            themeColor: '36a64f',
          };
          await notificationService.sendTeamsNotification(
            prefs.teams_webhook_url,
            teamsMessage
          );
        } else {
          throw new Error('Unknown notification type');
        }

        return true;
      } catch (error) {
        console.error('Error sending test notification:', error);
        throw error;
      }
    },
  },
};
