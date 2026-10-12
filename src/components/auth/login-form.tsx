"use client";

import Link from "next/link";
import { AlertCircle, Lock } from "lucide-react";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction, type AuthState } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { cn } from "cn";

/**
 * Sign in.
 *
 * Three fields, not four. The MPIN is deliberately *not* here even though the
 * account has one: the app lock already asks for it, the moment the redirect
 * lands, before any workspace content exists on screen. Asking for it twice on
 * one visit trains people to type PINs into anything that looks like a login box,
 * which is the exact behaviour a lock exists to discourage — and it would mean two
 * fields that must agree, checked in two different places, for one secret.
 */
export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction] = useActionState<AuthState, FormData>(signInAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
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
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className={cn(
              "text-xs text-muted-foreground underline-offset-4",
              "transition-colors hover:text-foreground hover:underline"
            )}
          >
            Forgot?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className="h-11 transition-all duration-200 focus-visible:ring-3"
          required
        />
      </div>

      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>

      <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          If you set an MPIN, Ownspece will ask for it next to open your workspace.
        </span>
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Don’t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}