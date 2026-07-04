"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { StatusBadge } from "@/components/status-badge";
import { useApp } from "@/lib/store";
import { fetchWorkflow, triggerPipelineRun, type GqlWorkflow, type GqlTriggerPipelineRunInput } from "@/lib/graphql-client";
import { formatDate } from "@/lib/format";
import { Play } from "lucide-react";

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token, loading } = useApp();
  const [workflow, setWorkflow] = useState<GqlWorkflow | null>(null);
  const [isTriggerOpen, setIsTriggerOpen] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);

  useEffect(() => {
    if (loading || !params.id) {
      return;
    }

    void fetchWorkflow(token, params.id).then((response) => {
      setWorkflow(response.workflow);
    });
  }, [loading, params.id, token]);

  async function onTriggerWorkflow() {
    if (!workflow) {
      return;
    }

    setIsTriggering(true);
    try {
      const input: GqlTriggerPipelineRunInput = {
        workflowId: workflow.id,
        trigger_type: "MANUAL",
        manual: {
          user_id: undefined,
        },
      };

      const response = await triggerPipelineRun(token, workflow.org_id, input);
      toast({ title: "Workflow triggered", description: `Run ${response.triggerPipelineRun.id.slice(0, 8)} has been created.` });
      setIsTriggerOpen(false);
      router.push(`/runs/${response.triggerPipelineRun.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to trigger workflow";
      toast({ variant: "destructive", title: "Trigger failed", description: message });
    } finally {
      setIsTriggering(false);
    }
  }

  if (!params.id) {
    notFound();
  }

  if (!loading && workflow === null) {
    return (
      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Workflow not found</CardTitle>
          <CardDescription>The requested workflow is not available to the current user.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!workflow) {
    return (
      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Loading workflow...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge className="border-mint-500/30 bg-mint-500/10 text-mint-400">Workflow detail</Badge>
          <h1 className="mt-3 text-3xl font-semibold text-ink-100">{workflow.name}</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-500">{workflow.description ?? "No description provided."}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={workflow.is_active ? "success" : "pending"} />
          <Dialog open={isTriggerOpen} onOpenChange={setIsTriggerOpen}>
            <Button
              onClick={() => setIsTriggerOpen(true)}
              disabled={!workflow.is_active}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              Trigger run
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Trigger workflow</DialogTitle>
                <DialogDescription>Start a new pipeline run for this workflow immediately.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <p className="text-sm font-medium text-ink-100">Workflow</p>
                  <p className="mt-1 text-sm text-ink-500">{workflow.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-100">Trigger type</p>
                  <p className="mt-1 text-sm text-ink-500">Manual</p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setIsTriggerOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void onTriggerWorkflow()} disabled={isTriggering}>
                  {isTriggering ? "Triggering..." : "Trigger"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button asChild variant="secondary">
            <Link href={`/runs?workflowId=${workflow.id}`}>View runs</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Workflow ID</CardDescription>
            <CardTitle className="font-mono text-base">{workflow.id}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Organization</CardDescription>
            <CardTitle className="font-mono text-base">{workflow.org_id}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Created by</CardDescription>
            <CardTitle className="font-mono text-base">{workflow.created_by ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Timestamps</CardDescription>
            <CardTitle className="text-base">{formatDate(workflow.created_at)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Triggers</CardTitle>
          <CardDescription>Exact trigger objects returned by the backend.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {workflow.triggers.length === 0 ? (
            <p className="text-sm text-ink-500">No triggers configured.</p>
          ) : (
            workflow.triggers.map((trigger, index) => (
              <div key={`${trigger.type}-${index}`} className="rounded-2xl border border-ink-700 bg-ink-950/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink-100">{trigger.type}</p>
                  <Badge className="border-ink-700 bg-ink-800 text-ink-500">trigger {index + 1}</Badge>
                </div>
                <pre className="mt-3 overflow-auto rounded-xl bg-ink-950/60 p-4 font-mono text-xs text-ink-100">
                  {prettyJson(trigger)}
                </pre>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Definition</CardTitle>
          <CardDescription>Workflow definition payload and job graph.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-2xl border border-ink-700 bg-ink-950/60 p-4 font-mono text-xs text-ink-100">
            {prettyJson(workflow.definition)}
          </pre>
        </CardContent>
      </Card>

      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
          <CardDescription>Jobs declared in the workflow definition.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Dependencies</TableHead>
                <TableHead>Steps</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflow.definition.jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-ink-500">
                    No jobs defined.
                  </TableCell>
                </TableRow>
              ) : (
                workflow.definition.jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-ink-100">{job.name}</p>
                        <p className="font-mono text-xs text-ink-500">{job.id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-ink-500">{job.image}</TableCell>
                    <TableCell className="font-mono text-xs text-ink-500">{job.depends_on?.join(", ") ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-ink-500">{job.steps.map((step) => step.run).join(" | ")}</TableCell>
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
