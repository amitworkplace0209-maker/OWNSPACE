"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Delete,
  Fingerprint,
  Loader2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  unlockWithMpinAction,
  requestMpinResetAction,
  type SecurityState,
} from "@/lib/actions/security";
import { MPIN_MAX } from "@/lib/security/mpin";
import { useNow } from "@/hooks/use-now";
import { cn } from "cn";

/**
 * The lock screen.
 *
 * Reached only when the account has the lock on and this browser has not been
 * unlocked recently. Renders nothing behind it: the point of a lock is that the
 * data behind it never reaches the DOM, so this is a sibling of the app rather
 * than a layer over it.
 *
 * The keypad is a real one rather than a text field because an MPIN has no
 * letters to mistype, the OS keyboard would suggest them anyway, and a hidden
 * numeric input underneath is what makes paste and autofill possible for people
 * using a keyboard or a screen reader.
 */
export function AppLockScreen({
  onUnlocked,
  biometricAvailable = false,
  onUseBiometric,
}: {
  onUnlocked: () => void;
  biometricAvailable: boolean;
  onUseBiometric: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = React.useState<number | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [biometricBusy, setBiometricBusy] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [resetEmail, setResetEmail] = React.useState("");

  // Ticks only while a lockout is actually running, so a screen nobody is
  // locked out of is not waking the browser once a second for a timestamp it
  // never reads. Once per second is enough for a "12:59 remaining" to read as a
  // countdown rather than jumping between whole minutes.
  const now = useNow(lockedUntil === null ? 60_000 : 1_000);
  const locked = lockedUntil !== null && lockedUntil > now;

  // Minutes left, rounded up, because "0 minutes remaining" while one is still
  // counting would tell someone to keep waiting for nothing.
  const minutesLeft = locked
    ? Math.max(1, Math.ceil((lockedUntil - now) / 60_000))
    : null;

  function pushDigit(digit: string) {
    if (locked) return;
    setError(null);
    setPin((current) => (current.length >= MPIN_MAX ? current : current + digit));
  }

  function popDigit() {
    setError(null);
    setPin((current) => current.slice(0, -1));
  }

  async function submit() {
    if (!pin || checking || locked) return;
    setChecking(true);
    setError(null);

    const result = (await unlockWithMpinAction(pin)) as SecurityState;
    setChecking(false);

    if (result.success) {
      toast.success("Unlocked");
      onUnlocked();
      return;
    }

    setError(result.error ?? "That MPIN is not right.");
    setLockedUntil(result.lockedUntil ?? null);
    // Cleared either way: keeping the digits on screen after a failure is how a
    // shoulder-surfer reads them off the lock screen.
    setPin("");
  }

  const canSubmit = pin.length >= 4;

  return (
    <div
      className="fixed inset-0 z-100 flex flex-col items-center justify-center gap-6 bg-background px-6 py-10"
      role="dialog"
      aria-modal="true"
      aria-label="Ownspece is locked"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="size-5" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight">Ownspece is locked</h1>
        <p className="text-sm text-muted-foreground">
          Enter your MPIN to continue.
        </p>
      </div>

      {/* The dots. `aria-hidden` because the field below is what a screen reader
          should announce — a row of bullets conveys nothing. */}
      <div aria-hidden="true" className="flex gap-3">
        {Array.from({ length: MPIN_MAX }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "size-3 rounded-full border-2 transition-all duration-150",
              index < pin.length
                ? "scale-110 border-primary bg-primary"
                : "border-muted-foreground/30"
            )}
          />
        ))}
      </div>

      {/* The real input: invisible, but focusable and typable, so a hardware
          keyboard, a paste and an autofill all work. */}
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        aria-label="MPIN"
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, MPIN_MAX))}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
        className="h-px w-px opacity-0"
      />

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-center text-sm text-destructive"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {locked ? (
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {minutesLeft !== null
              ? `Too many wrong attempts. Try again in about ${minutesLeft} ${
                  minutesLeft === 1 ? "minute" : "minutes"
                }.`
              : "Too many wrong attempts. Forgotten it? Reset it with your email."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetting(true)}
          >
            Reset my MPIN
          </Button>
        </div>
      ) : (
        <div className="grid w-full max-w-[15rem] grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <KeypadButton key={digit} onClick={() => pushDigit(digit)} disabled={checking}>
              {digit}
            </KeypadButton>
          ))}

          {biometricAvailable ? (
            <KeypadButton
              onClick={async () => {
                setBiometricBusy(true);
                const ok = await onUseBiometric();
                setBiometricBusy(false);
                if (ok) onUnlocked();
              }}
              disabled={checking || biometricBusy}
              label="Unlock with biometrics"
            >
              {biometricBusy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Fingerprint className="size-5" />
              )}
            </KeypadButton>
          ) : (
            <span aria-hidden="true" />
          )}

          <KeypadButton onClick={popDigit} disabled={checking} label="Delete last digit">
            <Delete className="size-5" />
          </KeypadButton>

          <KeypadButton onClick={() => pushDigit("0")} disabled={checking}>
            0
          </KeypadButton>

          <KeypadButton
            onClick={() => void submit()}
            disabled={!canSubmit || checking}
            tone="primary"
            label="Unlock"
          >
            {checking ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ArrowRight className="size-5" />
            )}
          </KeypadButton>
        </div>
      )}

      {resetting ? (
        <div className="flex w-full max-w-xs flex-col items-end gap-2">
          <label htmlFor="reset-mpin-email" className="text-xs text-muted-foreground">
            Reset link kis email pe bhejein?
          </label>
          <input
            id="reset-mpin-email"
            type="email"
            value={resetEmail}
            onChange={(event) => setResetEmail(event.target.value)}
            placeholder="you@example.com"
            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
          />
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setResetting(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={!resetEmail.trim()}
              onClick={async () => {
                const result = await requestMpinResetAction(resetEmail);
                if (result.error) toast.error(result.error);
                else {
                  toast.success(result.success);
                  setResetting(false);
                }
                router.refresh();
              }}
            >
              Send reset link
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KeypadButton({
  children,
  onClick,
  disabled,
  label,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  tone?: "default" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-14 items-center justify-center rounded-xl text-xl font-medium transition-all duration-150",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "active:scale-95 disabled:pointer-events-none disabled:opacity-40",
        tone === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/85 hover:shadow-md"
          : "border border-border bg-card hover:border-primary/40 hover:bg-accent hover:shadow-sm"
      )}
    >
      {children}
    </button>
  );
}

/** Shown while the lock state is being read, before anything else renders. */
export function AppLockChecking() {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-background">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
