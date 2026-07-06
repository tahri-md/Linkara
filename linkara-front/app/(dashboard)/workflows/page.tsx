"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "@/components/ui/use-toast";
import { useApp } from "@/lib/store";
import { createWorkflow, fetchOrganizations, fetchWorkflows, type GqlOrganization, type GqlWorkflow } from "@/lib/graphql-client";
import { formatDate } from "@/lib/format";
import { ChevronDown, Plus, X } from "lucide-react";

const jobSchema = z.object({
  key: z.string(), // client-side stable key for react, never sent to the server
  id: z
    .string()
    .min(1, "Job ID is required")
    .regex(/^[a-z0-9_-]+$/, "lowercase letters, numbers, - or _ only"),
  name: z.string().min(1, "Job name is required"),
  image: z.string().min(1, "Job image is required"),
  run: z.string().min(1, "Run command is required"),
  dependsOn: z.array(z.string()).default([]),
});

const createWorkflowSchema = z
  .object({
    name: z.string().min(2, "Workflow name is required"),
    description: z.string().optional(),
    repoUrl: z.string().min(1, "Repository URL is required"),
    repoRef: z.string().optional(),
    jobs: z.array(jobSchema).min(1, "At least one job is required"),
    triggerType: z.enum(["MANUAL", "SCHEDULED", "WEBHOOK", "API"]),
    triggerConfig: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const ids = values.jobs.map((j) => j.id);
    const idSet = new Set(ids);

    if (idSet.size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Job IDs must be unique",
        path: ["jobs"],
      });
    }

    values.jobs.forEach((job, i) => {
      job.dependsOn.forEach((dep) => {
        if (dep === job.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${job.id}" cannot depend on itself`,
            path: ["jobs", i, "dependsOn"],
          });
        } else if (!idSet.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown dependency "${dep}"`,
            path: ["jobs", i, "dependsOn"],
          });
        }
      });
    });

    // cycle detection (DFS)
    const graph = new Map(values.jobs.map((j) => [j.id, j.dependsOn]));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    function hasCycle(node: string): boolean {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      for (const dep of graph.get(node) ?? []) {
        if (graph.has(dep) && hasCycle(dep)) return true;
      }
      visiting.delete(node);
      visited.add(node);
      return false;
    }

    if (ids.some((id) => hasCycle(id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Circular dependency detected between jobs",
        path: ["jobs"],
      });
    }
  });

type CreateWorkflowValues = z.infer<typeof createWorkflowSchema>;

const DEFAULT_JOBS: CreateWorkflowValues["jobs"] = [
  {
    key: "job-0",
    id: "build",
    name: "Build",
    image: "node:20-alpine",
    run: "npm install\nnpm run build",
    dependsOn: [],
  },
];

export default function WorkflowsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, loading } = useApp();
  const [organizations, setOrganizations] = useState<GqlOrganization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(searchParams.get("orgId"));
  const [workflows, setWorkflows] = useState<GqlWorkflow[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const form = useForm<CreateWorkflowValues>({
    resolver: zodResolver(createWorkflowSchema),
    defaultValues: {
      name: "",
      description: "",
      repoUrl: "",
      repoRef: "main",
      jobs: DEFAULT_JOBS,
      triggerType: "MANUAL",
      triggerConfig: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "jobs",
  });
  const watchedJobs = form.watch("jobs");

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

    router.replace(`/workflows?orgId=${selectedOrgId}`);
    void fetchWorkflows(token, selectedOrgId, false, 50, 0)
      .then((response) => {
        setWorkflows(response.workflows.data);
      })
      .catch((error) => {
        console.error("[workflows] fetch failed:", error);
        toast({
          variant: "destructive",
          title: "Couldn't load workflows",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      });
  }, [loading, router, selectedOrgId, token]);

  const selectedOrg = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrgId) ?? null,
    [organizations, selectedOrgId],
  );

  async function onCreateWorkflow(values: CreateWorkflowValues) {
    if (!selectedOrgId) {
      toast({ variant: "destructive", title: "Select an organization", description: "Choose an organization before creating a workflow." });
      return;
    }

    try {
      const response = await createWorkflow(token, selectedOrgId, {
        name: values.name,
        description: values.description || undefined,
        definition: {
          repository: {
            url: values.repoUrl,
            ref: values.repoRef || "main",
          },
          jobs: values.jobs.map((job) => ({
            id: job.id,
            name: job.name,
            image: job.image,
            steps: job.run
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((run) => ({ run })),
            depends_on: job.dependsOn.length ? job.dependsOn : undefined,
          })),
        },
        triggers: [
          {
            type: values.triggerType,
            config: values.triggerConfig ? values.triggerConfig : null,
          },
        ],
        is_active: true,
      });

      setWorkflows((current) => [response.createWorkflow, ...current]);
      setIsCreateOpen(false);
      form.reset({
        name: "",
        description: "",
        repoUrl: "",
        repoRef: "main",
        jobs: DEFAULT_JOBS,
        triggerType: "MANUAL",
        triggerConfig: "",
      });
      toast({ title: "Workflow created", description: `${response.createWorkflow.name} is ready.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create workflow";
      toast({ variant: "destructive", title: "Create failed", description: message });
    }
  }

  return (
    <Card className="border-ink-700 bg-ink-900/90">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <Badge className="border-mint-500/30 bg-mint-500/10 text-mint-400">Workflows</Badge>
          <CardTitle className="mt-3 text-2xl">Workflow inventory</CardTitle>
          <CardDescription>
            {selectedOrg ? `Showing workflows for ${selectedOrg.name}` : "Select an organization to view workflows."}
          </CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="min-w-68 justify-between">
                {selectedOrg ? selectedOrg.name : "Select organization"}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-68">
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

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!selectedOrgId}>
                <Plus className="mr-2 h-4 w-4" />
                New workflow
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create workflow</DialogTitle>
                <DialogDescription>Define your repository, jobs, and a trigger.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form className="space-y-4" onSubmit={form.handleSubmit(onCreateWorkflow)}>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Deploy API" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Optional workflow summary" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="repoUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Repository URL</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://github.com/org/repo.git" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="repoRef"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Branch / ref</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="main" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel>Jobs</FormLabel>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          append({
                            key: `job-${fields.length}-${Date.now()}`,
                            id: "",
                            name: "",
                            image: "node:20-alpine",
                            run: "",
                            dependsOn: [],
                          })
                        }
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add job
                      </Button>
                    </div>

                    {fields.map((field, index) => {
                      const otherJobs = watchedJobs?.filter((_, i) => i !== index) ?? [];
                      return (
                        <div key={field.id} className="space-y-3 rounded-md border border-ink-800 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-ink-500">Job {index + 1}</span>
                            {fields.length > 1 && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>

                          <div className="grid gap-3 md:grid-cols-3">
                            <FormField
                              control={form.control}
                              name={`jobs.${index}.id`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Job ID</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="build" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`jobs.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Job name</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Build" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`jobs.${index}.image`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Image</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="node:20-alpine" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name={`jobs.${index}.run`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Run commands (one per line)</FormLabel>
                                <FormControl>
                                  <Textarea {...field} placeholder={"npm install\nnpm run build"} rows={3} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {otherJobs.length > 0 && (
                            <FormField
                              control={form.control}
                              name={`jobs.${index}.dependsOn`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Depends on</FormLabel>
                                  <div className="flex flex-wrap gap-3">
                                    {otherJobs.map((other) => (
                                      <label
                                        key={other.id || other.key}
                                        className="flex items-center gap-1.5 text-sm text-ink-300"
                                      >
                                        <input
                                          type="checkbox"
                                          className="accent-mint-500"
                                          checked={field.value?.includes(other.id)}
                                          onChange={(e) => {
                                            const next = e.target.checked
                                              ? [...(field.value ?? []), other.id]
                                              : (field.value ?? []).filter((id) => id !== other.id);
                                            field.onChange(next);
                                          }}
                                        />
                                        {other.id || "(unnamed job)"}
                                      </label>
                                    ))}
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </div>
                      );
                    })}
                    {form.formState.errors.jobs?.root?.message && (
                      <p className="text-sm text-red-400">{form.formState.errors.jobs.root.message}</p>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="triggerType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Trigger type</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="MANUAL" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="triggerConfig"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Trigger config</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder='{"branch":"main"}' />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? "Creating..." : "Create workflow"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-sm text-ink-500">{workflows.length} workflows loaded from the live API.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Jobs</TableHead>
              <TableHead>Triggers</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {workflows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-ink-500">
                  No workflows found.
                </TableCell>
              </TableRow>
            ) : (
              workflows.map((workflow) => (
                <TableRow key={workflow.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium text-ink-100">{workflow.name}</p>
                      <p className="max-w-xl text-sm text-ink-500">{workflow.description ?? "No description"}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={workflow.is_active ? "success" : "pending"} />
                  </TableCell>
                  <TableCell>{workflow.definition.jobs.length}</TableCell>
                  <TableCell>{workflow.triggers.length}</TableCell>
                  <TableCell>{formatDate(workflow.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/workflows/${workflow.id}`}>Open</Link>
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