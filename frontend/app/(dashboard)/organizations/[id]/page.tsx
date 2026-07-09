"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import {
  addOrganizationMember,
  fetchOrganization,
  removeOrganizationMember,
  type GqlOrganization,
  updateOrganizationMemberRole,
  fetchUserByEmail,
  inviteMember,
  GqlOrgInvite,
  revokeInvite,
  fetchPendingInvites,
} from "@/lib/graphql-client";
import { useApp } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { ChevronDown, Plus, Shield, Trash2 } from "lucide-react";
import { NotificationSettingsPanel } from "@/components/notification-settings-panel";
import { SecretsPanel } from "@/components/secrets-panel";

const addMemberSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]),
});

type AddMemberValues = z.infer<typeof addMemberSchema>;

const roleOptions: AddMemberValues["role"][] = ["OWNER", "ADMIN", "EDITOR", "VIEWER"];

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const { token, loading } = useApp();
  const [organization, setOrganization] = useState<GqlOrganization | null>(null);
  const [memberActionOpen, setMemberActionOpen] = useState(false);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<AddMemberValues["role"]>("VIEWER");

  const form = useForm<AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      email: "",
      role: "VIEWER",
    },
  });

  useEffect(() => {
    if (loading || !params.id) {
      return;
    }

    let cancelled = false;

    async function loadOrganization() {
      const response = await fetchOrganization(token, params.id);
      if (!cancelled) {
        setOrganization(response.organization);
      }
    }

    void loadOrganization();

    return () => {
      cancelled = true;
    };
  }, [loading, params.id, token]);

  if (!params.id) {
    notFound();
  }

  async function refreshOrganization() {
    const response = await fetchOrganization(token, params.id);
    setOrganization(response.organization);
  }


  async function onInviteMember(values: AddMemberValues) {
    try {
      await inviteMember(token, {
        organizationId: params.id,
        email: values.email,
        role: values.role,
      });
      toast({ title: "Invite sent", description: `${values.email} will get an email to join.` });
      setMemberActionOpen(false);
      form.reset();
      await loadPendingInvites();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Invite failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const [pendingInvites, setPendingInvites] = useState<GqlOrgInvite[]>([]);

  async function loadPendingInvites() {
    const res = await fetchPendingInvites(token, params.id);
    setPendingInvites(res.pendingInvites);
  }

  useEffect(() => {
    if (!loading && params.id) void loadPendingInvites();
  }, [loading, params.id]);

  async function handleRevoke(inviteId: string) {
    await revokeInvite(token, params.id, inviteId);
    await loadPendingInvites();
  }

  async function onUpdateRole(userId: string, role: AddMemberValues["role"]) {
    try {
      await updateOrganizationMemberRole(token, {
        organizationId: params.id,
        userId,
        role,
      });
      await refreshOrganization();
      toast({ title: "Role updated", description: `${userId} is now ${role}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update role";
      toast({ variant: "destructive", title: "Update failed", description: message });
    }
  }

  async function onRemoveMember(userId: string) {
    try {
      await removeOrganizationMember(token, params.id, userId);
      await refreshOrganization();
      toast({ title: "Member removed", description: "The member has been removed from the organization." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove member";
      toast({ variant: "destructive", title: "Remove failed", description: message });
    }
  }

  if (!loading && organization === null) {
    return (
      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Organization not found</CardTitle>
          <CardDescription>The requested organization is not available to the current user.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!organization) {
    return (
      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Loading organization...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[1.5rem] border border-ink-700 bg-ink-900 p-6 shadow-glow lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Badge className="border-mint-500/30 bg-mint-500/10 text-mint-400">Organization detail</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-100">{organization.name}</h1>
          <p className="max-w-3xl text-sm text-ink-500">{organization.description ?? "No description provided."}</p>
          <div className="flex flex-wrap gap-2 pt-2 text-xs text-ink-500">
            <span className="rounded-full border border-ink-700 bg-ink-950/40 px-3 py-1">Slug {organization.slug}</span>
            <span className="rounded-full border border-ink-700 bg-ink-950/40 px-3 py-1">Owner {organization.owner_id}</span>
            <span className="rounded-full border border-ink-700 bg-ink-950/40 px-3 py-1">Created : {new Date(Number(organization.created_at)).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <Link href={`/workflows?orgId=${organization.id}`}>View workflows</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/runs?orgId=${organization.id}`}>View runs</Link>
          </Button>
          <Dialog open={memberActionOpen} onOpenChange={setMemberActionOpen}>
            <Button asChild={false} onClick={() => setMemberActionOpen(true)} className="gap-2">
              <span>
                <Plus className="h-4 w-4" />
              </span>
              Invite member
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add organization member</DialogTitle>
                <DialogDescription>Enter a user email from the backend users table and assign a role.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form className="space-y-4" onSubmit={form.handleSubmit(onInviteMember)}>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="user@example.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            className="flex h-10 w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
                          >
                            {roleOptions.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setMemberActionOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? "Adding..." : "Add member"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Members</CardDescription>
            <CardTitle className="text-3xl">{organization.members.length}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Workflows</CardDescription>
            <CardTitle className="text-3xl">Open</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ink-500">
            Link to workflows for this organization from the action buttons above.
          </CardContent>
        </Card>
        <Card className="border-ink-700 bg-ink-900/90">
          <CardHeader>
            <CardDescription>Runs</CardDescription>
            <CardTitle className="text-3xl">Open</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ink-500">
            Link to recent pipeline runs for this organization from the action buttons above.
          </CardContent>
        </Card>
      </section>
      {pendingInvites.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-sm font-medium text-ink-300">Pending invites</p>
          {pendingInvites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between rounded-md border border-ink-800 px-3 py-2">
              <span className="text-sm text-ink-300">{invite.email} — {invite.role}</span>
              <Button size="sm" variant="ghost" onClick={() => handleRevoke(invite.id)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose how you're notified about pipeline runs in this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationSettingsPanel token={token} orgId={params.id} />
        </CardContent>
      </Card>
      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Secrets</CardTitle>
          <CardDescription>CI secrets available to this organization's jobs.</CardDescription>
        </CardHeader>
        <CardContent>
          <SecretsPanel token={token} orgId={params.id} />
        </CardContent>
      </Card>
      <Card className="border-ink-700 bg-ink-900/90">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>Current organization membership returned by the GraphQL backend.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refreshOrganization()}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Member ID</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {organization.members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-ink-500">
                    No members found.
                  </TableCell>
                </TableRow>
              ) : (
                organization.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-ink-100">{member.user.name ?? member.user.email}</p>
                        <p className="text-xs text-ink-500">{member.user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="secondary" size="sm" className="gap-2">
                            <Shield className="h-4 w-4" />
                            {member.role}
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {roleOptions.map((role) => (
                            <DropdownMenuItem key={role} onSelect={() => void onUpdateRole(member.user_id, role)}>
                              {role}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell>{formatDate(member.joined_at)}</TableCell>
                    <TableCell className="font-mono text-xs text-ink-500">{member.id}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => void onRemoveMember(member.user_id)}
                        disabled={member.user_id === organization.owner_id}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
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
