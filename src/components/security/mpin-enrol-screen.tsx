"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeMpinSetupAction } from "@/lib/actions/security";
import { saveLocalMpin } from "@/lib/security/local-mpin.client";
import { MPIN_MAX, MPIN_MIN } from "@/lib/security/mpin";
import { cn } from "cn";

/**
 * The one-time MPIN setup, for an account that has never chosen one.
 *
 * New accounts choose their MPIN on the sign-up form, where it is hashed and
 * written in the same request that creates the account. This screen is for the
 * accounts that predate that — the ones whose row exists with no hash — and
 * for the moment after a password reset, when the old hash has been cleared
 * so a new one can be chosen.
 *
 * Skipping is allowed, and skipping means *only* skipping this session — there is
 * no server-side "dismissed" flag, because a permanent dismissal would leave
 * somebody who meant to set a PIN never getting the chance, with no sign it
 * happened. Settings carries the real on/off switch.
 */
export function MpinEnrolScreen({
  userId,
  onDone,
  onSkip,
}: {
  userId: string;
  onDone: () => void;
  onSkip: () => void;
}) {
  const router = useRouter();
  const [mpin, setMpin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (mpin !== confirm) {
      setError("The two MPINs do not match.");
      return;
    }

    setBusy(true);
    setError(null);

    const result = await completeMpinSetupAction({ mpin, confirm });
    setBusy(false);

    if (result.error) {
      setError(result.error);
      // Cleared on failure rather than left on screen: whatever else is true,
      // digits should not stay in the DOM after the form said no.
      setMpin("");
      setConfirm("");
      return;
    }

    // The same PIN is derived on this device too, so from here on the lock
    // screen opens with no connection. Best-effort: if this write fails the
    // account copy still works, and the next unlock simply repairs it.
    void saveLocalMpin(userId, mpin);

    onDone();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Protect your workspace</h1>
          <p className="text-sm text-muted-foreground">
            Choose a {MPIN_MIN}–{MPIN_MAX} digit MPIN. Ownspece will ask for it every time it
            opens, so nobody with your phone can read your notes, tasks and money.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="setup-mpin">MPIN</Label>
            <Input
              id="setup-mpin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              autoFocus
              value={mpin}
              onChange={(event) =>
                setMpin(event.target.value.replace(/\D/g, "").slice(0, MPIN_MAX))
              }
              placeholder="••••••"
              className="h-11 text-center text-lg tracking-[0.5em]"
              required
            />
            <p className="text-xs text-muted-foreground">
              Stored as a salted scrypt hash. The number itself is never written anywhere.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="setup-mpin-confirm">Confirm MPIN</Label>
            <Input
              id="setup-mpin-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) =>
                setConfirm(event.target.value.replace(/\D/g, "").slice(0, MPIN_MAX))
              }
              placeholder="••••••"
              className="h-11 text-center text-lg tracking-[0.5em]"
              required
            />
          </div>

          <Button type="submit" size="lg" disabled={busy || !mpin}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            Turn on the app lock
          </Button>

          <button
            type="button"
            onClick={onSkip}
            className={cn(
              "text-center text-xs text-muted-foreground underline-offset-4",
              "transition-colors hover:text-foreground hover:underline"
            )}
          >
            Skip for now — you can set this in Settings
          </button>
        </form>
      </div>
    </div>
  );
}