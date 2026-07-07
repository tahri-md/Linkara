import nodemailer from "nodemailer";
import axios from "axios";
import crypto from "crypto";
import { query } from "../db/connection.js";
import type {
  NotificationPreference,
  NotificationLog,
  SlackMessage,
  TeamsMessage,
  NotificationInput,
} from "../models/Notification.js";
import { jobService } from "./JobService.js";

export class NotificationService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async sendEmailNotification(
    userId: string,
    subject: string,
    template: "pipeline_success" | "pipeline_failed" | "job_failed",
    data: {
      pipelineRunId: string;
      workflowName: string;
      status: string;
      duration?: number;
      jobName?: string;
    },
  ): Promise<void> {
    try {
      const userResult = await query(`SELECT email FROM users WHERE id = $1`, [
        userId,
      ]);
      if (userResult.rows.length === 0) {
        throw new Error("User not found");
      }

      const email = userResult.rows[0].email;
      const htmlContent = this.getEmailTemplate(template, data);

      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || "noreply@linkara.dev",
        to: email,
        subject,
        html: htmlContent,
      });
    } catch (error) {
      console.error("Failed to send email notification:", error);
      throw error;
    }
  }

  async sendInviteEmail(email: string, orgName: string, token: string): Promise<void> {
    const acceptUrl = `${process.env.APP_BASE_URL || "http://localhost:3000"}/invites/${token}`;

    const html = `
     <html>
       <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
         <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
           <h2>You've been invited to join ${orgName} on Linkara</h2>
           <p>Click below to accept the invite. This link expires in 7 days.</p>
           <p><a href="${acceptUrl}" style="background:#33ffa0;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;">Accept invite</a></p>
           <p><small>If you weren't expecting this, you can ignore this email.</small></p>
         </div>
       </body>
     </html>
   `;
    +
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || "noreply@linkara.dev",
        to: email,
        subject: `You've been invited to join ${orgName} on Linkara`,
        html,
      });
  }
  async sendSlackNotification(
    webhookUrl: string,
    message: SlackMessage,
  ): Promise<void> {
    try {
      if (!webhookUrl) {
        throw new Error("Slack webhook URL is required");
      }

      await axios.post(webhookUrl, message, {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Failed to send Slack notification:", error);
      throw error;
    }
  }

  async sendTeamsNotification(
    webhookUrl: string,
    message: TeamsMessage,
  ): Promise<void> {
    try {
      if (!webhookUrl) {
        throw new Error("Teams webhook URL is required");
      }

      await axios.post(webhookUrl, message, {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Failed to send Teams notification:", error);
      throw error;
    }
  }

  async getNotificationPreferences(
    userId: string,
    orgId: string,
  ): Promise<NotificationPreference | null> {
    const result = await query(
      `SELECT * FROM notification_preferences WHERE user_id = $1 AND org_id = $2`,
      [userId, orgId],
    );

    return result.rows.length > 0
      ? (result.rows[0] as NotificationPreference)
      : null;
  }

  async setNotificationPreferences(
    userId: string,
    orgId: string,
    preferences: NotificationInput,
  ): Promise<NotificationPreference> {
    const id = this.generateUUID();
    const now = new Date();

    const existing = await this.getNotificationPreferences(userId, orgId);

    if (existing) {
      const result = await query(
        `UPDATE notification_preferences
         SET email_on_success = $1,
             email_on_failure = $2,
             slack_webhook_url = $3,
             teams_webhook_url = $4,
             notify_on = $5,
             updated_at = $6
         WHERE user_id = $7 AND org_id = $8
         RETURNING *`,
        [
          preferences.email_on_success,
          preferences.email_on_failure,
          preferences.slack_webhook_url || null,
          preferences.teams_webhook_url || null,
          preferences.notify_on,
          now,
          userId,
          orgId,
        ],
      );

      return result.rows[0] as NotificationPreference;
    }

    const result = await query(
      `INSERT INTO notification_preferences
       (id, user_id, org_id, email_on_success, email_on_failure, slack_webhook_url, teams_webhook_url, notify_on, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        userId,
        orgId,
        preferences.email_on_success,
        preferences.email_on_failure,
        preferences.slack_webhook_url || null,
        preferences.teams_webhook_url || null,
        preferences.notify_on,
        now,
        now,
      ],
    );

    return result.rows[0] as NotificationPreference;
  }

  async notifyJobCompletion(
    jobId: string,
    status: "success" | "failure",
  ): Promise<void> {
    try {
      const job = await jobService.getJobById(jobId);
      if (!job) {
        throw new Error("Job not found");
      }

      const pipelineRunResult = await query(
        `SELECT pr.*, w.name as workflow_name, w.org_id
         FROM pipeline_runs pr
         JOIN workflows w ON w.id = pr.workflow_id
         WHERE pr.id = $1`,
        [job.pipeline_run_id],
      );

      if (pipelineRunResult.rows.length === 0) {
        throw new Error("Pipeline run not found");
      }

      const pipelineRun = pipelineRunResult.rows[0];
      const orgId = pipelineRun.org_id;

      const membersResult = await query(
        `SELECT user_id FROM org_members WHERE org_id = $1`,
        [orgId],
      );

      const duration: number | undefined = job.duration_seconds ?? undefined;

      const template: "pipeline_success" | "pipeline_failed" =
        status === "success" ? "pipeline_success" : "pipeline_failed";

      for (const member of membersResult.rows) {
        const userId = member.user_id;
        const prefs = await this.getNotificationPreferences(userId, orgId);

        if (!prefs) continue;

        const shouldNotify =
          prefs.notify_on === "all" ||
          (prefs.notify_on === "failure_only" && status === "failure");

        if (!shouldNotify) continue;

        if (
          (status === "success" && prefs.email_on_success) ||
          (status === "failure" && prefs.email_on_failure)
        ) {
          try {
            const subject =
              status === "success"
                ? `Pipeline Success: ${pipelineRun.workflow_name}`
                : `Pipeline Failed: ${pipelineRun.workflow_name}`;

            await this.sendEmailNotification(userId, subject, template, {
              pipelineRunId: job.pipeline_run_id,
              workflowName: pipelineRun.workflow_name,
              status,
              duration,
              jobName: job.job_name,
            });

            await this.logNotification(userId, jobId, "email", "sent");
          } catch (error) {
            console.error(
              `Failed to send email notification to ${userId}:`,
              error,
            );
            await this.logNotification(
              userId,
              jobId,
              "email",
              "failed",
              error instanceof Error ? error.message : "Unknown error",
            );
          }
        }

        if (prefs.slack_webhook_url) {
          try {
            const slackMessage = this.buildSlackMessage(
              status,
              pipelineRun.workflow_name,
              job.job_name,
              duration,
            );
            await this.sendSlackNotification(
              prefs.slack_webhook_url,
              slackMessage,
            );

            await this.logNotification(userId, jobId, "slack", "sent");
          } catch (error) {
            console.error(
              `Failed to send Slack notification to ${userId}:`,
              error,
            );
            await this.logNotification(
              userId,
              jobId,
              "slack",
              "failed",
              error instanceof Error ? error.message : "Unknown error",
            );
          }
        }

        if (prefs.teams_webhook_url) {
          try {
            const teamsMessage = this.buildTeamsMessage(
              status,
              pipelineRun.workflow_name,
              job.job_name,
              duration,
            );
            await this.sendTeamsNotification(
              prefs.teams_webhook_url,
              teamsMessage,
            );

            await this.logNotification(userId, jobId, "teams", "sent");
          } catch (error) {
            console.error(
              `Failed to send Teams notification to ${userId}:`,
              error,
            );
            await this.logNotification(
              userId,
              jobId,
              "teams",
              "failed",
              error instanceof Error ? error.message : "Unknown error",
            );
          }
        }
      }
    } catch (error) {
      console.error("Error in notifyJobCompletion:", error);
    }
  }

  private async logNotification(
    userId: string,
    jobId: string,
    notificationType: "email" | "slack" | "teams",
    status: "sent" | "failed",
    errorMessage?: string,
  ): Promise<void> {
    const id = this.generateUUID();
    const now = new Date();

    await query(
      `INSERT INTO notification_logs (id, user_id, job_id, notification_type, status, sent_at, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, userId, jobId, notificationType, status, now, errorMessage || null],
    );
  }

  private getEmailTemplate(
    template: string,
    data: {
      pipelineRunId: string;
      workflowName: string;
      status: string;
      duration?: number;
      jobName?: string;
    },
  ): string {
    const statusBgColor = data.status === "success" ? "#4CAF50" : "#F44336";
    const statusText = data.status === "success" ? "SUCCESS" : "FAILED";

    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Pipeline Notification</h2>
            <div style="background-color: ${statusBgColor}; color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin: 0;">Status: ${statusText}</h3>
            </div>
            <p><strong>Workflow:</strong> ${data.workflowName}</p>
            ${data.jobName ? `<p><strong>Job:</strong> ${data.jobName}</p>` : ""}
            <p><strong>Pipeline Run ID:</strong> ${data.pipelineRunId}</p>
            ${data.duration ? `<p><strong>Duration:</strong> ${data.duration} seconds</p>` : ""}
            <p><small>This is an automated message from Linkara CI/CD Platform</small></p>
          </div>
        </body>
      </html>
    `;
  }

  private buildSlackMessage(
    status: string,
    workflowName: string,
    jobName: string,
    duration?: number,
  ): SlackMessage {
    const color = status === "success" ? "#36a64f" : "#ff0000";
    const title =
      status === "success" ? "✅ Pipeline Success" : "❌ Pipeline Failed";

    return {
      text: `${title}: ${workflowName}`,
      attachments: [
        {
          color,
          title,
          fields: [
            { title: "Workflow", value: workflowName, short: true },
            { title: "Job", value: jobName, short: true },
            { title: "Status", value: status.toUpperCase(), short: true },
            {
              title: "Duration",
              value: duration ? `${duration}s` : "N/A",
              short: true,
            },
          ],
        },
      ],
    };
  }

  private buildTeamsMessage(
    status: string,
    workflowName: string,
    jobName: string,
    duration?: number,
  ): TeamsMessage {
    const themeColor = status === "success" ? "36a64f" : "ff0000";
    const title =
      status === "success" ? "✅ Pipeline Success" : "❌ Pipeline Failed";

    return {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      summary: `${title}: ${workflowName}`,
      sections: [
        {
          activityTitle: title,
          activitySubtitle: workflowName,
          facts: [
            { name: "Workflow", value: workflowName },
            { name: "Job", value: jobName },
            { name: "Status", value: status.toUpperCase() },
            { name: "Duration", value: duration ? `${duration}s` : "N/A" },
          ],
        },
      ],
      themeColor,
    };
  }

  private generateUUID(): string {
    return crypto.randomUUID();
  }
}

export const notificationService = new NotificationService();
