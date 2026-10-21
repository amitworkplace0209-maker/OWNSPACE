"use client";

import Link from "next/link";
import { AlertCircle, Fingerprint, Lock } from "lucide-react";
import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInAction,
  signInWithPasswordAction,
  type AuthState,
} from "@/lib/auth/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { MPIN_MAX, MPIN_MIN } from "@/lib/security/mpin";
import { cn } from "cn";

/**
 * Sign in.
 *
 * Two fields: the email address and the MPIN. The account also has a
 * password, and it matters — it is what the reset email changes, and it is how
 * somebody who has forgotten their MPIN gets back in — but it is not what the
 * door asks for. The MPIN is, because it is the secret the app already makes
 * the user type every time it opens. Asking for both would mean two secrets
 * that have to agree, checked in two different places, for one account.
 *
 * The password form is one tap away rather than hidden: a user who has
 * forgotten their MPIN should not have to guess where it went.
 */
export function LoginForm({ next }: { next: string | null }) {
  const [mode, setMode] = useState<"mpin" | "password">("mpin");

  return mode === "mpin" ? (
    <MpinSignInForm next={next} onUsePassword={() => setMode("password")} />
  ) : (
    <PasswordSignInForm next={next} onUseMpin={() => setMode("mpin")} />
  );
}

function MpinSignInForm({
  next,
  onUsePassword,
}: {
  next: string | null;
  onUsePassword: () => void;
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(signInAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />

      {state.error ? <FormError message={state.error} /> : null}

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
        <Label htmlFor="mpin">MPIN</Label>
        <Input
          id="mpin"
          name="mpin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={MPIN_MAX}
          placeholder="••••••"
          className="h-11 tracking-[0.4em] transition-all duration-200 focus-visible:ring-3"
          required
        />
        <p className="text-xs text-muted-foreground">
          The {MPIN_MIN}–{MPIN_MAX} digit number you chose when you signed up.
        </p>
      </div>

      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onUsePassword}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4",
            "transition-colors hover:text-foreground hover:underline"
          )}
        >
          <Fingerprint aria-hidden="true" className="size-3.5" />
          Use my password instead
        </button>
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

      <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Your MPIN is also what unlocks Ownspece on this device, so nobody with
          your phone can read your workspace.
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

function PasswordSignInForm({
  next,
  onUseMpin,
}: {
  next: string | null;
  onUseMpin: () => void;
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(
    signInWithPasswordAction,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />

      {state.error ? <FormError message={state.error} /> : null}

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

      <SubmitButton pendingText="Signing in…">Sign in with password</SubmitButton>

      <button
        type="button"
        onClick={onUseMpin}
        className={cn(
          "text-center text-xs text-muted-foreground underline-offset-4",
          "transition-colors hover:text-foreground hover:underline"
        )}
      >
        Use my MPIN instead
      </button>
    </form>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
