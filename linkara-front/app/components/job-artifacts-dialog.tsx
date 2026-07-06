"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchJobArtifacts, type GqlJobArtifact } from "@/lib/graphql-client";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function JobArtifactsDialog({
  jobId,
  jobName,
  token,
  trigger,
}: {
  jobId: string;
  jobName: string;
  token: string | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [artifacts, setArtifacts] = useState<GqlJobArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchJobArtifacts(token, jobId);
        if (!cancelled) setArtifacts(res.jobArtifacts);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load artifacts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, jobId, token]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)}>{trigger}</div>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{jobName} — artifacts</DialogTitle>
          <DialogDescription>Files reported by this job&apos;s build steps.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {loading && <p className="text-ink-500 text-sm">Loading...</p>}
          {error && <p className="text-red-400 text-sm">Error: {error}</p>}
          {!loading && !error && artifacts.length === 0 && (
            <p className="text-ink-500 text-sm">No artifacts reported for this job.</p>
          )}
          {artifacts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border border-ink-800 px-3 py-2"
            >
              <div>
                <p className="text-sm text-ink-200">{a.name}</p>
                <p className="text-xs text-ink-500">{formatBytes(a.file_size_bytes)}</p>
              </div>
              {a.s3_url ? (
                <Button asChild size="sm" variant="secondary">
                  <a href={a.s3_url} target="_blank" rel="noreferrer">
                    Download
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-ink-600">Not stored</span>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}