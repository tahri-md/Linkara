"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { StatusBadge } from "@/components/status-badge";
import { useApp } from "@/lib/store";
import { fetchOrganizations, fetchPipelineRuns, fetchWorkflows, triggerPipelineRun, type GqlOrganization, type GqlPipelineRunResponse, type GqlTriggerPipelineRunInput } from "@/lib/graphql-client";
import { formatDate, formatDuration } from "@/lib/format";
import { ChevronDown, Play, RefreshCcw } from "lucide-react";

export default function RunsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, loading } = useApp();
  const [organizations, setOrganizations] = useState<GqlOrganization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(searchParams.get("orgId"));
  const [workflowId, setWorkflowId] = useState<string | null>(searchParams.get("workflowId"));
  const [runs, setRuns] = useState<GqlPipelineRunResponse[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isTriggerOpen, setIsTriggerOpen] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);

  useEffect(() => {
    if (loading) {
      return;
    }

    void fetchOrganizations(token).then((response) => {
      setOrganizations(response.organizations);
      setSelectedOrgId((current) => current ?? response.organizations[0]?.id ?? null);
    });
  }, [loading, token]);

  useEffect(() => {
    if (!selectedOrgId || loading) {
      return;
    }

    router.replace(`/runs?orgId=${selectedOrgId}${workflowId ? `&workflowId=${workflowId}` : ""}`);
  }, [loading, router, selectedOrgId, workflowId]);

  useEffect(() => {
    if (!selectedOrgId || loading) {
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function loadRuns() {
      setRefreshing(true);
      try {
        const orgId = selectedOrgId;
        if (!orgId) {
          return;
        }

        const response = await fetchPipelineRuns(token, orgId, workflowId ?? undefined, 30, 0);
        if (!cancelled) {
          setRuns(response.pipelineRuns.data);
        }
      } finally {
        if (!cancelled) {
          setRefreshing(false);
        }
      }
    }

    void loadRuns();
    intervalId = setInterval(() => {
      void loadRuns();
    }, 10000);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [loading, selectedOrgId, token, workflowId]);

  const selectedOrg = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrgId) ?? null,
    [organizations, selectedOrgId],
  );

  async function onTriggerWorkflow() {
    if (!workflowId || !selectedOrgId) {
      toast({ variant: "destructive", title: "Select a workflow", description: "Please select a workflow to trigger." });
      return;
    }

    setIsTriggering(true);
    try {
      const input: GqlTriggerPipelineRunInput = {
        workflowId,
        trigger_type: "MANUAL",
        manual: {
          user_id: undefined,
        },
      };

      const response = await triggerPipelineRun(token, selectedOrgId, input);
      toast({ title: "Workflow triggered", description: `Run ${response.triggerPipelineRun.id.slice(0, 8)} has been created.` });
      setIsTriggerOpen(false);
      
      // Reload runs immediately
      const runsResponse = await fetchPipelineRuns(token, selectedOrgId, workflowId ?? undefined, 30, 0);
      setRuns(runsResponse.pipelineRuns.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to trigger workflow";
      toast({ variant: "destructive", title: "Trigger failed", description: message });
    } finally {
      setIsTriggering(false);
    }
  }

  return (
    <Card className="border-ink-700 bg-ink-900/90">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <Badge className="border-mint-500/30 bg-mint-500/10 text-mint-400">Pipeline runs</Badge>
          <CardTitle className="mt-3 text-2xl">Execution history</CardTitle>
          <CardDescription>
            {selectedOrg ? `Showing runs for ${selectedOrg.name}` : "Select an organization to view runs."}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="min-w-[17rem] justify-between">
                {selectedOrg ? selectedOrg.name : "Select organization"}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[17rem]">
              {organizations.map((org) => (
                <DropdownMenuItem key={org.id} onSelect={() => setSelectedOrgId(org.id)}>
                  <div className="flex flex-col">
                    <span className="font-medium text-ink-100">{org.name}</span>
                    <span className="text-xs text-ink-500">{org.slug}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => void fetchPipelineRuns(token, selectedOrgId ?? "", workflowId ?? undefined, 30, 0).then((response) => setRuns(response.pipelineRuns.data))} disabled={!selectedOrgId}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={isTriggerOpen} onOpenChange={setIsTriggerOpen}>
            <Button
              onClick={() => setIsTriggerOpen(true)}
              disabled={!workflowId}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              Trigger run
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Trigger workflow</DialogTitle>
                <DialogDescription>Start a new pipeline run for the selected workflow.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <p className="text-sm font-medium text-ink-100">Workflow ID</p>
                  <p className="mt-1 font-mono text-sm text-ink-500">{workflowId}</p>
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
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center justify-between gap-4 text-sm text-ink-500">
          <p>{runs.length} runs loaded from the API.</p>
          <p>{refreshing ? "Polling live status..." : "Polling every 10 seconds"}</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-ink-500">
                  No pipeline runs found.
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium text-ink-100">{run.id}</p>
                      <p className="font-mono text-xs text-ink-500">Workflow {run.workflow_id}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="uppercase tracking-wide text-ink-500">{run.trigger_type}</TableCell>
                  <TableCell>{formatDuration(run.duration_seconds)}</TableCell>
                  <TableCell>{formatDate(run.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/runs/${run.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
