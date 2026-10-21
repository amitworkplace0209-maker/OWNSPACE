"use client";

import Link from "next/link";
import { AlertCircle, MailCheck, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, type AuthState } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { MPIN_MAX, MPIN_MIN } from "@/lib/security/mpin";

/**
 * Create an account.
 *
 * Four things are asked for, and each of them has a job:
 *
 *  - **Name** — what people and reminders are addressed by.
 *  - **Email** — where the confirmation and the reset link go.
 *  - **Password** — the recovery secret. The reset email changes it, so it is
 *    what gets somebody back in after they have forgotten their MPIN.
 *  - **MPIN** — the number the app asks for every time it opens, and the one
 *    the sign-in form accepts in place of the password.
 *
 * The MPIN is asked for here rather than after the first sign-in because it is
 * part of making an account, not a setting to find later. It is hashed on the
 * server before it is stored and never written down anywhere in the clear.
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
          required
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
        <p className="text-xs text-muted-foreground">
          Used to recover your account if you forget your MPIN.
        </p>
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
          className="h-11 text-center text-lg tracking-[0.5em] transition-all duration-200 focus-visible:ring-3"
          required
        />
        <p className="text-xs text-muted-foreground">
          {MPIN_MIN}–{MPIN_MAX} digits. This is what unlocks Ownspece, and what
          you sign in with.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm_mpin">Confirm MPIN</Label>
        <Input
          id="confirm_mpin"
          name="confirm_mpin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={MPIN_MAX}
          placeholder="••••••"
          className="h-11 text-center text-lg tracking-[0.5em] transition-all duration-200 focus-visible:ring-3"
          required
        />
      </div>

      <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Your MPIN is stored as a salted hash. Ownspece asks for it every time
          it opens, so nobody with your phone can read your notes, tasks and
          money.
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
