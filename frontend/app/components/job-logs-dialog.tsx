"use client";

import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { streamJobLogs, type GqlJobLog } from "@/lib/graphql-client";

const LEVEL_COLOR: Record<string, string> = {
    ERROR: "text-red-400",
    WARNING: "text-amber-400",
    DEBUG: "text-ink-500",
    INFO: "text-ink-300",
};

export function JobLogsDialog({
    jobId,
    jobName,
    token,
    isRunning,
    trigger,
}: {
    jobId: string;
    jobName: string;
    token: string | null;
    isRunning: boolean;
    trigger: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [logs, setLogs] = useState<GqlJobLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!open) return;

        const controller = new AbortController();
        setLoading(true);
        setError(null);
        setLogs([]);

        void streamJobLogs(token, jobId, controller.signal, (log) => {
            setLogs((current) => {
                if (current.some((item) => item.id === log.id)) return current;
                return [...current, log].sort((a, b) => {
                    const lineOrder = (a.line_number ?? Number.MAX_SAFE_INTEGER)
                        - (b.line_number ?? Number.MAX_SAFE_INTEGER);
                    return lineOrder || a.timestamp.localeCompare(b.timestamp);
                });
            });
            setLoading(false);
        }).catch((err) => {
            if (controller.signal.aborted) return;
            setError(err instanceof Error ? err.message : "Failed to load logs");
            console.error("[job-logs] stream failed:", err);
        }).finally(() => setLoading(false));

        return () => {
            controller.abort();
        };
    }, [open, jobId, token]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <div onClick={() => setOpen(true)}>{trigger}</div>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{jobName} — logs</DialogTitle>
                    <DialogDescription>
                        {isRunning ? "Live log stream." : "Captured output."}
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto rounded-md bg-ink-950 p-4 font-mono text-xs">
                    {logs.length === 0 ? (
                        <p className="text-ink-500">
                            {loading
                                ? "Loading logs..."
                                : error
                                    ? `Error loading logs: ${error}`
                                    : "No logs captured for this job."}                        </p>
                    ) : (
                        logs.map((log) => (
                            <div key={log.id} className="whitespace-pre-wrap">
                                <span className="text-ink-600">
                                    [{new Date(log.timestamp).toLocaleTimeString()}]{" "}
                                </span>
                                <span className={LEVEL_COLOR[log.level] ?? "text-ink-300"}>
                                    {log.message}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
