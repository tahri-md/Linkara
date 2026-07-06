"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { useApp } from "@/lib/store";
import { fetchPipelineRun, type GqlPipelineRunResponse } from "@/lib/graphql-client";
import { formatDate, formatDuration } from "@/lib/format";
import { JobLogsDialog } from "@/components/job-logs-dialog";

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const { token, loading } = useApp();
  const [run, setRun] = useState<GqlPipelineRunResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (loading || !params.id) {
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function loadRun() {
      setIsPolling(true);
      try {
        const response = await fetchPipelineRun(token, params.id);
        if (!cancelled) {
          setRun(response.pipelineRun);
        }
      } finally {
        if (!cancelled) {
          setIsPolling(false);
        }
      }
    }

    void loadRun();
    intervalId = setInterval(() => {
      void loadRun();
    }, 5000);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [loading, params.id, token]);

  if (!params.id) {
    notFound();
  }

  if (!loading && run === null) {
    return (
      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Run not found</CardTitle>
          <CardDescription>The requested pipeline run is not available to the current user.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!run) {
    return (
      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Loading run...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge className="border-mint-500/30 bg-mint-500/10 text-mint-400">Run detail</Badge>
          <h1 className="mt-3 text-3xl font-semibold text-ink-100">{run.id}</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-500">Live execution detail for the selected pipeline run.</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={run.status} />
          <Button asChild variant="secondary">
            <Link href={`/workflows/${run.workflow_id}`}>Open workflow</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-base">{run.status}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Trigger</CardDescription>
            <CardTitle className="text-base">{run.trigger_type}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Duration</CardDescription>
            <CardTitle className="text-base">{formatDuration(run.duration_seconds)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Updated</CardDescription>
            <CardTitle className="text-base">{formatDate(run.created_at)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
            <CardDescription>Exact identifiers from the GraphQL payload.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-ink-500">
            <p><span className="text-ink-100">Workflow:</span> <span className="font-mono">{run.workflow_id}</span></p>
            <p><span className="text-ink-100">Organization:</span> <span className="font-mono">{run.org_id}</span></p>
            <p><span className="text-ink-100">Triggered by:</span> <span className="font-mono">{run.triggered_by ?? "-"}</span></p>
            <p><span className="text-ink-100">Started:</span> {formatDate(run.started_at)}</p>
            <p><span className="text-ink-100">Completed:</span> {formatDate(run.completed_at)}</p>
          </CardContent>
        </Card>

        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardTitle>Polling</CardTitle>
            <CardDescription>Live refresh for status updates.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-ink-500">
            {isPolling ? "Refreshing run status from the API..." : "Updated on a 5 second interval."}
          </CardContent>
        </Card>
      </div>

      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
          <CardDescription>All jobs attached to this run.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Container</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Exit code</TableHead>
                <TableHead>Logs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-ink-500">
                    No jobs reported for this run.
                  </TableCell>
                </TableRow>
              ) : (
                run.jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-ink-100">{job.job_name}</p>
                        <p className="font-mono text-xs text-ink-500">{job.id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-ink-500">{job.docker_container_id ?? "-"}</TableCell>
                    <TableCell>{formatDuration(job.duration_seconds)}</TableCell>
                    <TableCell className="font-mono text-xs text-ink-500">{job.exit_code ?? "-"}</TableCell>
                    <TableCell>
                      <JobLogsDialog
                        jobId={job.id}
                        jobName={job.job_name}
                        token={token}
                        isRunning={job.status === "RUNNING"}
                        trigger={<Button variant="secondary" size="sm">View</Button>}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
