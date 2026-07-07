"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function extractToken(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/invites\/([a-f0-9]{64,})/i);
  return match ? match[1] : trimmed;
}

export default function InvitesLandingPage() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleGo() {
    const token = extractToken(value);
    if (token) router.push(`/invites/${token}`);
  }

  return (
    <Card className="mx-auto mt-12 max-w-lg border-ink-700 bg-ink-900/90">
      <CardHeader>
        <CardTitle>Have an invite?</CardTitle>
        <CardDescription>
          Paste the invite link or code from your email to join the organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Input
          placeholder="Invite link or code"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGo()}
        />
        <Button onClick={handleGo} disabled={!value.trim()}>
          Go
        </Button>
      </CardContent>
    </Card>
  );
}