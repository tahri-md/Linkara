"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { acceptInvite } from "@/lib/graphql-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { token: authToken, loading: authLoading } = useApp();
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setStatus("loading");
    try {
      const res = await acceptInvite(authToken, params.token);
      setStatus("done");
      setTimeout(() => router.push(`/organizations/${res.acceptInvite.organization_id}`), 1500);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    }
  }

  if (authLoading) return null;

  if (!authToken) {
    return (
      <Card className="mx-auto mt-20 max-w-md border-ink-700 bg-ink-900/90">
        <CardHeader>
          <CardTitle>Sign in required</CardTitle>
          <CardDescription>Log in or create an account with the email this invite was sent to, then come back to this link.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push(`/login?redirect=/invites/${params.token}`)}>
            Go to login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto mt-20 max-w-md border-ink-700 bg-ink-900/90">
      <CardHeader>
        <CardTitle>Organization invite</CardTitle>
        <CardDescription>
          {status === "done" ? "Joined — redirecting..." : "Accept this invite to join the organization."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status === "error" && <p className="mb-3 text-sm text-red-400">{error}</p>}
        {status !== "done" && (
          <Button onClick={handleAccept} disabled={status === "loading"}>
            {status === "loading" ? "Accepting..." : "Accept invite"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}