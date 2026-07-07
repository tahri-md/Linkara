"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import {
    fetchNotificationPreferences,
    setNotificationPreferences,
    sendTestNotification,
    type GqlNotifyOn,
} from "@/lib/graphql-client";

export function NotificationSettingsPanel({
    token,
    orgId,
}: {
    token: string | null;
    orgId: string;
}) {
    const [emailOnSuccess, setEmailOnSuccess] = useState(false);
    const [emailOnFailure, setEmailOnFailure] = useState(true);
    const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
    const [teamsWebhookUrl, setTeamsWebhookUrl] = useState("");
    const [notifyOn, setNotifyOn] = useState<GqlNotifyOn>("failure_only");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetchNotificationPreferences(token, orgId);
                const prefs = res.notificationPreferences;
                if (!cancelled && prefs) {
                    setEmailOnSuccess(prefs.emailOnSuccess);
                    setEmailOnFailure(prefs.emailOnFailure);
                    setSlackWebhookUrl(prefs.slackWebhookUrl ?? "");
                    setTeamsWebhookUrl(prefs.teamsWebhookUrl ?? "");
                    setNotifyOn(prefs.notifyOn);
                }
            } catch (err) {
                if (!cancelled) {
                    toast({
                        variant: "destructive",
                        title: "Couldn't load notification settings",
                        description: err instanceof Error ? err.message : "Unknown error",
                    });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, orgId]);

    async function handleSave() {
        setSaving(true);
        try {
            await setNotificationPreferences(token, orgId, {
                emailOnSuccess,
                emailOnFailure,
                slackWebhookUrl: slackWebhookUrl || undefined,
                teamsWebhookUrl: teamsWebhookUrl || undefined,
                notifyOn,
            });
            toast({ title: "Notification settings saved" });
        } catch (err) {
            toast({
                variant: "destructive",
                title: "Save failed",
                description: err instanceof Error ? err.message : "Unknown error",
            });
        } finally {
            setSaving(false);
        }
    }

    async function handleTest(type: "email" | "slack" | "teams") {
        try {
            await setNotificationPreferences(token, orgId, {
                emailOnSuccess,
                emailOnFailure,
                slackWebhookUrl: slackWebhookUrl || undefined,
                teamsWebhookUrl: teamsWebhookUrl || undefined,
                notifyOn,
            });
            await sendTestNotification(token, orgId, type);
            toast({ title: `Test ${type} notification sent` });
        } catch (err) {
            toast({
                variant: "destructive",
                title: `Test ${type} notification failed`,
                description: err instanceof Error ? err.message : "Unknown error",
            });
        }
    }

    if (loading) {
        return <p className="text-sm text-ink-500">Loading notification settings...</p>;
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <p className="text-sm font-medium text-ink-200">Notify me on</p>
                <div className="flex gap-4 text-sm text-ink-300">
                    <label className="flex items-center gap-1.5">
                        <input
                            type="radio"
                            name="notifyOn"
                            checked={notifyOn === "all"}
                            onChange={() => setNotifyOn("all")}
                            className="accent-mint-500"
                        />
                        Every run
                    </label>
                    <label className="flex items-center gap-1.5">
                        <input
                            type="radio"
                            name="notifyOn"
                            checked={notifyOn === "failure_only"}
                            onChange={() => setNotifyOn("failure_only")}
                            className="accent-mint-500"
                        />
                        Failures only
                    </label>
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-sm font-medium text-ink-200">Email</p>
                <label className="flex items-center gap-1.5 text-sm text-ink-300">
                    <input
                        type="checkbox"
                        className="accent-mint-500"
                        checked={emailOnSuccess}
                        onChange={(e) => setEmailOnSuccess(e.target.checked)}
                    />
                    Email on success
                </label>
                <label className="flex items-center gap-1.5 text-sm text-ink-300">
                    <input
                        type="checkbox"
                        className="accent-mint-500"
                        checked={emailOnFailure}
                        onChange={(e) => setEmailOnFailure(e.target.checked)}
                    />
                    Email on failure
                </label>
                <Button size="sm" variant="secondary" onClick={() => handleTest("email")}>
                    Send test email
                </Button>
            </div>

            <div className="space-y-2">
                <p className="text-sm font-medium text-ink-200">Slack webhook URL</p>
                <Input
                    value={slackWebhookUrl}
                    onChange={(e) => setSlackWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                />
                <Button size="sm" variant="secondary" onClick={() => handleTest("slack")}>
                    Send test Slack message
                </Button>
            </div>

            <div className="space-y-2">
                <p className="text-sm font-medium text-ink-200">Teams webhook URL</p>
                <Input
                    value={teamsWebhookUrl}
                    onChange={(e) => setTeamsWebhookUrl(e.target.value)}
                    placeholder="https://outlook.office.com/webhook/..."
                />
                <Button size="sm" variant="secondary" onClick={() => handleTest("teams")}>
                    Send test Teams message
                </Button>
            </div>

            <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save notification settings"}
            </Button>
        </div>
    );
}