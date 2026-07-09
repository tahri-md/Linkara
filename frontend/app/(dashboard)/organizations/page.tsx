"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { createOrganization, fetchOrganizations, type GqlOrganization } from "@/lib/graphql-client";
import { useApp } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { Building2, Plus } from "lucide-react";

const createOrganizationSchema = z.object({
  name: z.string().min(2, "Organization name is required"),
  slug: z
    .string()
    .min(2, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only"),
  description: z.string().optional(),
  avatar_url: z.string().url().optional().or(z.literal("")),
});

type CreateOrganizationValues = z.infer<typeof createOrganizationSchema>;

function makeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function OrganizationsPage() {
  const { token, loading } = useApp();
  const [organizations, setOrganizations] = useState<GqlOrganization[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const form = useForm<CreateOrganizationValues>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      avatar_url: "",
    },
  });

  useEffect(() => {
    if (loading) {
      return;
    }

    let cancelled = false;

    async function loadOrganizations() {
      const response = await fetchOrganizations(token);
      if (!cancelled) {
        setOrganizations(response.organizations);
      }
    }

    void loadOrganizations();

    return () => {
      cancelled = true;
    };
  }, [loading, token]);

  async function onSubmit(values: CreateOrganizationValues) {
    try {
      const response = await createOrganization(token, {
        name: values.name,
        slug: values.slug,
        description: values.description || undefined,
        avatar_url: values.avatar_url || undefined,
      });

      setOrganizations((current) => [response.createOrganization, ...current]);
      setIsCreateOpen(false);
      form.reset();
      toast({ title: "Organization created", description: `${response.createOrganization.name} is ready.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create organization";
      toast({ variant: "destructive", title: "Create failed", description: message });
    }
  }

  const selectedEmptyState = useMemo(
    () => organizations.length === 0,
    [organizations.length],
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[1.5rem] border border-ink-700 bg-ink-900 p-6 shadow-glow lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Badge className="border-mint-500/30 bg-mint-500/10 text-mint-400">Organizations</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-100">Manage workspaces and ownership.</h1>
          <p className="max-w-2xl text-sm text-ink-500">
            Create new organizations, open their details, and manage access from the live backend.
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create organization</DialogTitle>
              <DialogDescription>Provision a new org and assign yourself as the owner.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Acme Platform"
                          onChange={(event) => {
                            field.onChange(event);
                            const currentSlug = form.getValues("slug");
                            if (!currentSlug) {
                              form.setValue("slug", makeSlug(event.target.value));
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="acme-platform" />
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
                        <Textarea {...field} placeholder="Optional org description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="avatar_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avatar URL</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://example.com/logo.png" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Creating..." : "Create organization"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {organizations.map((organization) => (
          <Card key={organization.id} className="border-ink-700 bg-ink-900/90">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-ink-700 bg-ink-950/40 text-mint-400">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{organization.name}</CardTitle>
                    <CardDescription>{organization.slug}</CardDescription>
                  </div>
                </div>
                <Badge className="border-ink-700 bg-ink-800 text-ink-500">{organization.members.length} members</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-ink-500">{organization.description ?? "No description provided."}</p>
              <div className="flex items-center justify-between text-xs text-ink-500">
                <span>Created : {new Date(Number(organization.created_at)).toLocaleString()}</span>
                <span>Owner {organization.owner_id.slice(0, 8)}</span>
              </div>
              <Button asChild variant="secondary" className="w-full">
                <Link href={`/organizations/${organization.id}`}>Open organization</Link>
              </Button>
            </CardContent>
          </Card>
        ))}

        {selectedEmptyState ? (
          <Card className="border-dashed border-ink-700 bg-ink-900/60 md:col-span-2 xl:col-span-3">
            <CardHeader>
              <CardTitle>No organizations yet</CardTitle>
              <CardDescription>Create the first organization to start grouping workflows and runs.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsCreateOpen(true)}>Create organization</Button>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
