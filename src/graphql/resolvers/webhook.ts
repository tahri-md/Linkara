import { WebhooksService } from "../../services/WebhooksService.js";
import { Webhook } from "../../models/Webhooks.js";

const webhookService = new WebhooksService();

interface CreateWebhookInput {
  workflowId: string;
  provider: "github" | "gitlab" | "bitbucket";
  events: string[];
}

interface HandleWebhookEventInput {
  webhookId: string;
  payload: any;
  signature: string;
  eventType: string;
}

export const webhookResolvers = {
  Query: {
    webhooks: async (
      _parent: any,
      _args: any,
      context: { orgId: string }
    ): Promise<Webhook[]> => {
      if (!context.orgId) {
        throw new Error("Authentication required: Organization ID not found in context");
      }

      return await webhookService.listWebhooks(context.orgId);
    },

    webhook: async (
      _parent: any,
      args: { id: string },
      context: { orgId: string }
    ): Promise<Webhook | null> => {
      if (!context.orgId) {
        throw new Error("Authentication required: Organization ID not found in context");
      }

      if (!args.id) {
        throw new Error("Webhook ID is required");
      }

      const webhooks = await webhookService.listWebhooks(context.orgId);
      return webhooks.find((w) => w.id === args.id) || null;
    },
  },

  Mutation: {
    createWebhook: async (
      _parent: any,
      args: { input: CreateWebhookInput },
      context: { orgId: string }
    ): Promise<{ webhook: Webhook; secret: string }> => {
      if (!context.orgId) {
        throw new Error("Authentication required: Organization ID not found in context");
      }

      const { workflowId, provider, events } = args.input;

      if (!workflowId || !provider || !events || events.length === 0) {
        throw new Error("Missing required fields: workflowId, provider, and events are required");
      }

      const webhook = await webhookService.createWebhook(
        context.orgId,
        workflowId,
        provider,
        events
      );

      return {
        webhook,
        secret: webhook.secret,
      };
    },

    handleWebhookEvent: async (
      _parent: any,
      args: { input: HandleWebhookEventInput },
      _context: any
    ): Promise<{
      success: boolean;
      pipelineRunId: string;
      message: string;
    }> => {
      const { webhookId, payload, signature, eventType } = args.input;

      if (!webhookId || !payload || !signature || !eventType) {
        throw new Error(
          "Missing required fields: webhookId, payload, signature, and eventType are required"
        );
      }

      try {
        const pipelineRun = await webhookService.handleWebhookEvent(
          webhookId,
          payload,
          signature,
          eventType
        );

        return {
          success: true,
          pipelineRunId: pipelineRun.id,
          message: `Webhook event processed and pipeline triggered successfully`,
        };
      } catch (error) {
        console.error(`[WebhookResolvers] Error processing webhook event:`, error);
        throw new Error(
          `Failed to process webhook event: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    },

    deleteWebhook: async (
      _parent: any,
      args: { id: string },
      context: { orgId: string }
    ): Promise<{
      success: boolean;
      message: string;
    }> => {
      if (!context.orgId) {
        throw new Error("Authentication required: Organization ID not found in context");
      }

      if (!args.id) {
        throw new Error("Webhook ID is required");
      }

      const webhooks = await webhookService.listWebhooks(context.orgId);
      const webhookExists = webhooks.some((w) => w.id === args.id);

      if (!webhookExists) {
        throw new Error("Webhook not found or does not belong to your organization");
      }

      const success = await webhookService.deleteWebhook(args.id);

      if (success) {
        return {
          success: true,
          message: "Webhook deleted successfully",
        };
      } else {
        throw new Error("Failed to delete webhook");
      }
    },

    updateWebhookEvents: async (
      _parent: any,
      args: { id: string; events: string[] },
      context: { orgId: string }
    ): Promise<Webhook> => {
      if (!context.orgId) {
        throw new Error("Authentication required: Organization ID not found in context");
      }

      if (!args.id || !args.events || args.events.length === 0) {
        throw new Error("Webhook ID and events array are required");
      }

      const webhooks = await webhookService.listWebhooks(context.orgId);
      const webhook = webhooks.find((w) => w.id === args.id);

      if (!webhook) {
        throw new Error("Webhook not found or does not belong to your organization");
      }

      return webhook;
    },
  },

  Webhook: {
    url: (webhook: Webhook) => {
      return webhook.url;
    },

    events: (webhook: Webhook) => {
      if (Array.isArray(webhook.events)) {
        return webhook.events;
      }
      try {
        return JSON.parse(webhook.events as any);
      } catch {
        return [];
      }
    },

   createdAt: (webhook:any) => {
    return webhook.created_at instanceof Date
      ? webhook.created_at.toISOString()
      : new Date(webhook.created_at).toISOString();
  },

  updatedAt: (webhook:any) => {
    if (!webhook.updated_at) return null;
    return webhook.updated_at instanceof Date
      ? webhook.updated_at.toISOString()
      : new Date(webhook.updated_at).toISOString();
  },
  },
};