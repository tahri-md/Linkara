"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { useApp } from "@/lib/store";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";
  const { login, isAuthenticated, loading } = useApp();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (isAuthenticated && !loading) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, loading, router]);

  async function onSubmit(values: LoginFormValues) {
    try {
      await login(values.email, values.password);
      toast({ title: "Signed in", description: "Your session is ready." });
      router.push(nextPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in";
      toast({ variant: "destructive", title: "Login failed", description: message });
    }
  }

  return (
    <Card className="border-ink-700/80 bg-ink-900/95 shadow-2xl shadow-black/30 backdrop-blur">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit rounded-full border border-mint-400/20 bg-mint-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-mint-400">
          Linkara access
        </div>
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>Use your workspace credentials to open the dashboard.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" autoComplete="email" placeholder="you@company.com" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input {...field} type="password" autoComplete="current-password" placeholder="••••••••" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Form>
        <p className="mt-6 text-sm text-ink-500">
          No account yet?{" "}
          <Link href="/signup" className="text-mint-400 hover:text-mint-500">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
