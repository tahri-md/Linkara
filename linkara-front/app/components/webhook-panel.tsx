"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  fetchWebhooks,
  createWebhook,
  deleteWebhook,
  type GqlWebhook,
} from "@/lib/graphql-client";

const PROVIDERS = ["github", "gitlab", "bitbucket"] as const;

export function WebhookPanel({
  token,
  orgId,
  workflowId,
}: {
  token: string | null;
  orgId: string;
  workflowId: string;
}) {
  const [webhooks, setWebhooks] = useState<GqlWebhook[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetchWebhooks(token, orgId);
    setWebhooks(res.webhooks.data.filter((w) => w.workflow_id === workflowId));
  }

  useEffect(() => {
    void load();
  }, [orgId, workflowId]);

  async function handleCreate(provider: (typeof PROVIDERS)[number]) {
    setLoading(true);
    try {
      const res = await createWebhook(token, {
        org_id: orgId,
        workflow_id: workflowId,
        provider,
        events: ["push"],
      });
      setRevealedSecret(res.createWebhook.secret);
      setRevealedUrl(res.createWebhook.url);
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteWebhook(token, id);
    await load();
  }

  return (
    <div className="space-y-3">
      {(revealedSecret || revealedUrl) && (
        <div className="rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm">
          {revealedUrl && (
            <>
              <p className="font-medium text-amber-300">
                Payload URL — paste this into your provider&apos;s webhook settings:
              </p>
              <code className="mt-1 block break-all text-xs text-ink-200">
                {revealedUrl}
              </code>
            </>
          )}
          {revealedSecret && (
            <>
              <p className="mt-3 font-medium text-amber-300">
                Signing secret — copy it now, it won&apos;t be shown again:
              </p>
              <code className="mt-1 block break-all text-xs text-ink-200">
                {revealedSecret}
              </code>
            </>
          )}
        </div>
      )}

      {webhooks.map((w) => (
        <div
          key={w.id}
          className="flex items-center justify-between rounded-md border border-ink-800 px-3 py-2"
        >
          <div>
            <p className="text-sm text-ink-200">{w.provider} — {w.events.join(", ")}</p>
            <code className="text-xs text-ink-500">{w.url}</code>
          </div>
          <Button size="sm" variant="secondary" onClick={() => handleDelete(w.id)}>
            Delete
          </Button>
        </div>
      ))}

      {webhooks.length === 0 && (
        <p className="text-sm text-ink-500">No webhook configured for this workflow.</p>
      )}

      <div className="flex gap-2">
        {PROVIDERS.map((p) => (
          <Button key={p} size="sm" disabled={loading} onClick={() => handleCreate(p)}>
            Add {p} webhook
          </Button>
        ))}
      </div>
    </div>
  );
}