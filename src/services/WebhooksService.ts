import { query } from "../db/connection.js";
import { Webhook } from "../models/Webhooks.js";
import { encryptSecret, decryptSecret } from "../utils/encryption.js";
import * as crypto from "crypto";
import { PipelineService } from "./PipelineService.js";
import { PipelineRun } from "../models/PipelineRun.js";

const SERVICE_NAME = "WebhooksService";

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is not set");
  return key;
}

export class WebhooksService {
  pipelineService = new PipelineService();

  verifySignature(secret: string, payload: any, signature: string): boolean {
    try {
      const hmac = crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(payload))
        .digest("hex");

      const expectedSignature = `sha256=${hmac}`;

      // Use constant-time comparison to prevent timing attacks
      const expectedBuf = Buffer.from(expectedSignature);
      const actualBuf = Buffer.from(signature);
      if (expectedBuf.length !== actualBuf.length) {
        console.warn(`[${SERVICE_NAME}] Webhook signature length mismatch`);
        return false;
      }
      const isValid = crypto.timingSafeEqual(expectedBuf, actualBuf);

      if (!isValid) {
        console.warn(`[${SERVICE_NAME}] Webhook signature verification failed`);
      }

      return isValid;
    } catch (error) {
      console.error(
        `[${SERVICE_NAME}] Error during signature verification:`,
        error,
      );
      return false;
    }
  }

  async createWebhook(
    orgId: string,
    workflowId: string,
    provider: "github" | "gitlab" | "bitbucket",
    events: string[],
  ): Promise<Webhook> {
    if (!orgId || !workflowId || !provider) {
      const error =
        "Missing required webhook parameters: orgId, workflowId, or provider";
      console.error(`[${SERVICE_NAME}] Validation failed: ${error}`);
      throw new Error(error);
    }

    if (!Array.isArray(events) || events.length === 0) {
      const error = "Events array must not be empty";
      console.error(`[${SERVICE_NAME}] Validation failed: ${error}`);
      throw new Error(error);
    }

    const existingResult = await query(
      `SELECT id FROM webhooks 
       WHERE org_id = $1 AND workflow_id = $2 AND provider = $3`,
      [orgId, workflowId, provider],
    );

    if (existingResult.rows.length > 0) {
      const error = `Webhook already exists for this workflow and provider`;
      console.warn(
        `[${SERVICE_NAME}] Webhook creation skipped: ${error} (webhook_id=${existingResult.rows[0].id})`,
      );
      throw new Error(error);
    }

    const rawSecret = generateWebhookSecret();
    const encryptedSecret = encryptSecret(rawSecret, getEncryptionKey());
    const id = crypto.randomUUID();
    const url = `${process.env.API_BASE_URL}/webhooks/${id}`;

    try {
      const result = await query(
        `INSERT INTO webhooks (id, org_id, workflow_id, provider, url, secret, events, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
         RETURNING *`,
        [
          id,
          orgId,
          workflowId,
          provider,
          url,
          encryptedSecret,
          JSON.stringify(events),
        ],
      );

      const webhook = result.rows[0];
      // Return with the plaintext secret so the caller can show it once to the user
      return { ...webhook, secret: rawSecret };
    } catch (error) {
      console.error(`[${SERVICE_NAME}] Error creating webhook:`, error);
      throw error;
    }
  }

  async handleWebhookEvent(
    webhookId: string,
    payload: any,
    signature: string,
    eventType: string,
  ): Promise<PipelineRun> {
    if (!webhookId) {
      const error = "Webhook ID is required";
      console.error(`[${SERVICE_NAME}] Invalid request: ${error}`);
      throw new Error(error);
    }

    const webhookResult = await query(
      `SELECT id, org_id, workflow_id, provider, secret, events, active 
       FROM webhooks WHERE id = $1`,
      [webhookId],
    );

    if (webhookResult.rows.length === 0) {
      const error = `Webhook not found`;
      console.warn(`[${SERVICE_NAME}] Webhook not found: id=${webhookId}`);
      throw new Error(error);
    }

    const webhook = webhookResult.rows[0];

    if (!webhook.active) {
      const error = `Webhook is disabled`;
      console.warn(`[${SERVICE_NAME}] Webhook is inactive: id=${webhookId}`);
      throw new Error(error);
    }

    // Decrypt the stored secret before verifying the signature
    const plaintextSecret = decryptSecret(webhook.secret, getEncryptionKey());
    const isValid = this.verifySignature(plaintextSecret, payload, signature);
    if (!isValid) {
      const error = `Webhook signature verification failed`;
      console.error(`[${SERVICE_NAME}] ${error}: id=${webhookId}`);
      throw new Error(error);
    }

    const subscribedEvents = Array.isArray(webhook.events)
      ? webhook.events
      : JSON.parse(webhook.events);

    if (!subscribedEvents.includes(eventType)) {
      const error = `Event type not subscribed: ${eventType}`;
      console.warn(
        `[${SERVICE_NAME}] Event type not subscribed: id=${webhookId}, eventType=${eventType}`,
      );
      throw new Error(error);
    }

    const data = {
      event: eventType,
      repo: payload.repository?.name,
      branch: payload.ref,
      commits: payload.commits || [],
      sender: payload.sender?.login || "unknown",
    };
    const workflow_re = await query("SELECT * FROM workflows WHERE id = $1", [
      webhook.workflow_id,
    ]);
    if (workflow_re.rows.length === 0) {
      const error = `Workflow not found`;
      throw new Error(error);
    }
    const workflow = workflow_re.rows[0];

    const pipelineRun = await this.pipelineService.trigger_pipelineRun(
      workflow,
      "webhook",
      data,
    );

    try {
      await query(
        `INSERT INTO webhook_events (id, webhook_id, event_type, payload, delivered_at, status)
         VALUES ($1, $2, $3, $4, NOW(), 'success')`,
        [crypto.randomUUID(), webhook.id, eventType, JSON.stringify(payload)],
      );
    } catch (logError) {
      console.error(`[${SERVICE_NAME}] Error logging webhook event:`, logError);
    }

    return pipelineRun;
  }

  async listWebhooks(orgId: string): Promise<Webhook[]> {
    if (!orgId) {
      const error = "Organization ID is required";
      console.error(`[${SERVICE_NAME}] Validation failed: ${error}`);
      throw new Error(error);
    }

    try {
      const result = await query(
        `SELECT id, org_id, workflow_id, provider, url, secret, events, active, created_at, updated_at
         FROM webhooks
         WHERE org_id = $1
         ORDER BY created_at DESC`,
        [orgId],
      );

      const webhooks = result.rows.map((row) => ({
        id: row.id,
        org_id: row.org_id,
        workflow_id: row.workflow_id,
        provider: row.provider,
        url: row.url,
        secret: row.secret,
        events: Array.isArray(row.events) ? row.events : JSON.parse(row.events),
        active: row.active,
        created_at: new Date(row.created_at),
        updated_at: row.updated_at ? new Date(row.updated_at) : null,
      }));

      return webhooks;
    } catch (error) {
      console.error(`[${SERVICE_NAME}] Error listing webhooks:`, error);
      throw error;
    }
  }

  async deleteWebhook(webhookId: string): Promise<boolean> {
    if (!webhookId) {
      const error = "Webhook ID is required";
      console.error(`[${SERVICE_NAME}] Validation failed: ${error}`);
      throw new Error(error);
    }

    try {
      const result = await query(
        `UPDATE webhooks
         SET active = false, updated_at = NOW()
         WHERE id = $1`,
        [webhookId],
      );

      const success = (result.rowCount ?? 0) > 0;

      if (!success) {
        console.warn(
          `[${SERVICE_NAME}] Webhook not found for deletion: id=${webhookId}`,
        );
      }

      return success;
    } catch (error) {
      console.error(`[${SERVICE_NAME}] Error deleting webhook:`, error);
      throw error;
    }
  }
}
