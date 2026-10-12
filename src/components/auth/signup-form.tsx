"use client";

import Link from "next/link";
import { AlertCircle, MailCheck, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, type AuthState } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/auth/submit-button";

/**
 * Create an account.
 *
 * The MPIN is set on the *first sign-in*, not here, and the note below says so
 * rather than leaving people wondering where it went. The reason is not a
 * preference: at this point there is no authenticated session, so an MPIN chosen
 * here would have to be carried through the confirmation email in the clear and
 * written by a privileged server. A secret that crosses an unverified channel is
 * worse than one that is asked for a moment later, from inside an app the user
 * has already proved they own.
 */
export function SignUpForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(signUpAction, {});

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
          <div>
            <p className="font-medium">Check your email</p>
            <p className="mt-0.5">{state.success}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display_name">Your name</Label>
        <Input
          id="display_name"
          name="display_name"
          type="text"
          autoComplete="name"
          placeholder="Ada Lovelace"
          maxLength={60}
          className="h-11 transition-all duration-200 focus-visible:ring-3"
        />
      </div>

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
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          minLength={6}
          className="h-11 transition-all duration-200 focus-visible:ring-3"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm_password">Confirm password</Label>
        <Input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your password"
          minLength={6}
          className="h-11 transition-all duration-200 focus-visible:ring-3"
          required
        />
      </div>

      <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        <span>
          After you sign in, you&apos;ll set an MPIN and an app lock — so nobody with your
          phone can read your workspace.
        </span>
      </p>

      <SubmitButton pendingText="Creating account…">
        Create account
      </SubmitButton>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
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