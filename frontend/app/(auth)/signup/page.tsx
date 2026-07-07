"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

const signupSchema = z.object({
  name: z.string().max(80, "Name is too long").optional(),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const { signup, isAuthenticated, loading } = useApp();

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (isAuthenticated && !loading) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, loading, router]);

  async function onSubmit(values: SignupFormValues) {
    try {
      await signup(values);
      toast({ title: "Account created", description: "Your workspace is ready." });
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign up";
      toast({ variant: "destructive", title: "Signup failed", description: message });
    }
  }

  return (
    <Card className="border-ink-700/80 bg-ink-900/95 shadow-2xl shadow-black/30 backdrop-blur">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit rounded-full border border-mint-400/20 bg-mint-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-mint-400">
          Start a workspace
        </div>
        <CardTitle className="text-2xl">Create account</CardTitle>
        <CardDescription>Register the first user for your self-hosted Linkara instance.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Jane Doe" autoComplete="name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="you@company.com" autoComplete="email" />
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
                    <Input {...field} type="password" autoComplete="new-password" placeholder="At least 8 characters" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </Form>
        <p className="mt-6 text-sm text-ink-500">
          Already have access?{" "}
          <Link href="/login" className="text-mint-400 hover:text-mint-500">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
