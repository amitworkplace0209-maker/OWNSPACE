"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, MailCheck, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/auth/submit-button";
import { requestPasswordResetAction, type ResetState } from "@/lib/actions/auth";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ResetState, FormData>(
    requestPasswordResetAction,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : state.success ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
        >
          <MailCheck className="mt-0.5 size-4 shrink-0" />
          <span>{state.success}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          className="h-11 transition-all duration-200 focus-visible:ring-3"
          required
        />
        <p className="text-xs text-muted-foreground">
          We&apos;ll email you a link to set a new password.
        </p>
      </div>

      <SubmitButton pendingText="Sending…">
        <Send className="size-4" />
        Send reset link
      </SubmitButton>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}