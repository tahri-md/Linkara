"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { useApp } from "@/lib/store";
import { fetchOrganizations, fetchPipelineRuns, fetchWorkflows, type GqlOrganization, type GqlPipelineRunResponse, type GqlWorkflow } from "@/lib/graphql-client";
import { formatDate, formatDuration, normalizeStatus } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronDown, GitBranch, PlayCircle, Server, Workflow } from "lucide-react";

export default function DashboardPage() {
  const { token, loading } = useApp();
  const [organizations, setOrganizations] = useState<GqlOrganization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<GqlWorkflow[]>([]);
  const [pipelineRuns, setPipelineRuns] = useState<GqlPipelineRunResponse[]>([]);
  const [isBusy, setIsBusy] = useState(true);

  useEffect(() => {
    if (loading) {
      return;
    }

    let cancelled = false;

    async function loadOrganizations() {
      setIsBusy(true);
      try {
        const response = await fetchOrganizations(token);
        if (cancelled) {
          return;
        }
        setOrganizations(response.organizations);
        setSelectedOrgId((current) => current ?? response.organizations[0]?.id ?? null);
      } finally {
        if (!cancelled) {
          setIsBusy(false);
        }
      }
    }

    void loadOrganizations();

    return () => {
      cancelled = true;
    };
  }, [loading, token]);

  useEffect(() => {
    if (!selectedOrgId || loading) {
      return;
    }

    let cancelled = false;

    async function loadOrgData() {
      setIsBusy(true);
      try {
        const orgId = selectedOrgId;
        if (!orgId) {
          return;
        }

        const [workflowResponse, runResponse] = await Promise.all([
          fetchWorkflows(token, orgId, false, 5, 0),
          fetchPipelineRuns(token, orgId, undefined, 6, 0),
        ]);
        if (cancelled) {
          return;
        }
        setWorkflows(workflowResponse.workflows.data);
        setPipelineRuns(runResponse.pipelineRuns.data);
      } finally {
        if (!cancelled) {
          setIsBusy(false);
        }
      }
    }

    void loadOrgData();

    return () => {
      cancelled = true;
    };
  }, [loading, selectedOrgId, token]);

  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === selectedOrgId) ?? null,
    [organizations, selectedOrgId],
  );

  const stats = [
    { label: "Organizations", value: organizations.length, icon: Server },
    { label: "Workflows", value: workflows.length, icon: Workflow },
    { label: "Recent runs", value: pipelineRuns.length, icon: PlayCircle },
    { label: "Active runs", value: pipelineRuns.filter((run) => normalizeStatus(run.status) === "running").length, icon: GitBranch },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[1.5rem] border border-ink-700 bg-ink-900 p-6 shadow-glow lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Badge className="border-mint-500/30 bg-mint-500/10 text-mint-400">Control plane overview</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-100">Operate your delivery pipeline from one place.</h1>
          <p className="max-w-2xl text-sm text-ink-500">
            Monitor organizations, workflows, and live pipeline activity from the real GraphQL backend.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="min-w-[17rem] justify-between">
              {selectedOrg ? selectedOrg.name : "Select organization"}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[17rem]">
            {organizations.length === 0 ? (
              <DropdownMenuItem disabled>No organizations found</DropdownMenuItem>
            ) : (
              organizations.map((org) => (
                <DropdownMenuItem key={org.id} onSelect={() => setSelectedOrgId(org.id)}>
                  <div className="flex flex-col">
                    <span className="font-medium text-ink-100">{org.name}</span>
                    <span className="text-xs text-ink-500">{org.slug}</span>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border-ink-700 bg-ink-900/90">
              <CardHeader className="pb-2">
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="flex items-end justify-between text-3xl">
                  {stat.value}
                  <Icon className="mb-1 h-5 w-5 text-mint-400" />
                </CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </section>

      <Tabs defaultValue="activity" className="space-y-4">
        <TabsList>
          <TabsTrigger value="activity">Recent activity</TabsTrigger>
          <TabsTrigger value="orgs">Organizations</TabsTrigger>
        </TabsList>
        <TabsContent value="activity" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-ink-700 bg-ink-900/90">
              <CardHeader>
                <CardTitle>Workflows</CardTitle>
                <CardDescription>Workflows for {selectedOrg?.name ?? "the selected organization"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workflows.length === 0 ? (
                  <p className="text-sm text-ink-500">No workflows found.</p>
                ) : (
                  workflows.map((workflow) => (
                    <div key={workflow.id} className="rounded-2xl border border-ink-700 bg-ink-950/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link href={`/workflows/${workflow.id}`} className="font-medium text-ink-100 hover:text-mint-400">
                            {workflow.name}
                          </Link>
                          <p className="mt-1 text-sm text-ink-500">{workflow.description ?? "No description"}</p>
                        </div>
                        <Badge className={cn("border", workflow.is_active ? "border-mint-500/30 bg-mint-500/10 text-mint-400" : "border-ink-700 bg-ink-800 text-ink-500")}>{workflow.is_active ? "active" : "inactive"}</Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-500">
                        <span>{workflow.definition.jobs.length} jobs</span>
                        <span>•</span>
                        <span>{workflow.triggers.length} triggers</span>
                        <span>•</span>
                        <span>{new Date(Number(workflow.created_at)).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-ink-700 bg-ink-900/90">
              <CardHeader>
                <CardTitle>Recent runs</CardTitle>
                <CardDescription>Live pipeline status for the current organization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pipelineRuns.length === 0 ? (
                  <p className="text-sm text-ink-500">No pipeline runs found.</p>
                ) : (
                  pipelineRuns.map((run) => (
                    <Link key={run.id} href={`/runs/${run.id}`} className="block rounded-2xl border border-ink-700 bg-ink-950/40 p-4 transition-colors hover:border-mint-500/40 hover:bg-ink-900">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-ink-100">Run {run.id.slice(0, 8)}</p>
                          <p className="text-sm text-ink-500">Workflow {run.workflow_id.slice(0, 8)} •{new Date(Number(run.created_at)).toLocaleString()}</p>
                        </div>
                        <StatusBadge status={run.status} />
                      </div>
                      <div className="mt-3 flex gap-4 text-xs text-ink-500">
                        <span>Duration {formatDuration(run.duration_seconds)}</span>
                        <span>Trigger {run.trigger_type.toLowerCase()}</span>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="orgs">
          <Card className="border-ink-700 bg-ink-900/90">
            <CardHeader>
              <CardTitle>Organizations</CardTitle>
              <CardDescription>All organizations accessible to the current user</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {organizations.map((org) => (
                  <div
                    key={org.id}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition-colors",
                      org.id === selectedOrgId
                        ? "border-mint-500/40 bg-mint-500/10"
                        : "border-ink-700 bg-ink-950/40 hover:border-ink-600 hover:bg-ink-900",
                    )}
                  >
                    <button type="button" className="w-full text-left" onClick={() => setSelectedOrgId(org.id)}>
                      <p className="font-medium text-ink-100">{org.name}</p>
                      <p className="mt-1 text-sm text-ink-500">{org.description ?? org.slug}</p>
                      <p className="mt-3 text-xs text-ink-500">Owner {org.owner_id.slice(0, 8)}</p>
                    </button>
                    <div className="mt-4 flex gap-2">
                      <Button asChild variant="secondary" size="sm" className="flex-1">
                        <Link href={`/organizations/${org.id}`}>Manage</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isBusy ? <p className="text-sm text-ink-500">Refreshing data…</p> : null}
    </div>
  );
}
