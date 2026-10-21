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
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  unlockWithMpinAction,
  recordLocalUnlockAction,
  requestMpinResetAction,
  type SecurityState,
} from "@/lib/actions/security";
import {
  saveLocalMpin,
  verifyLocalMpin,
} from "@/lib/security/local-mpin.client";
import {
  hasBiometric,
  hasDevicePin,
  subscribeToDeviceUnlock,
  verifyBiometric,
  verifyDevicePin,
} from "@/lib/security/device-unlock.client";
import { MPIN_MAX } from "@/lib/security/mpin";
import { useNow } from "@/hooks/use-now";
import { cn } from "cn";

type UnlockMode = "mpin" | "device";

/**
 * The lock screen.
 *
 * Reached only when the account has the lock on and this browser has not been
 * unlocked recently. Renders nothing behind it: the point of a lock is that the
 * data behind it never reaches the DOM, so this is a sibling of the app rather
 * than a layer over it.
 *
 * Three ways in, in the order they are offered:
 *
 *  1. **The device's fingerprint.** The machine's own secure hardware, asked
 *     once and remembered. Nothing about it reaches the server: the key is in
 *     the device and the public half never leaves it.
 *  2. **A device PIN.** A number set on this machine, kept here and nowhere
 *     else.
 *  3. **The account MPIN.** The one that travels, that works on any device,
 *     and that is the fallback when the other two are not set up.
 *
 * The keypad is a real one rather than a text field because an MPIN has no
 * letters to mistype, the OS keyboard would suggest them anyway, and a hidden
 * numeric input underneath is what makes paste and autofill possible for people
 * using a keyboard or a screen reader.
 */
export function AppLockScreen({
  userId,
  onUnlocked,
}: {
  userId: string;
  onUnlocked: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<UnlockMode>("mpin");
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = React.useState<number | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [fingerprinting, setFingerprinting] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [resetEmail, setResetEmail] = React.useState("");

  /**
   * What this device can offer besides the MPIN.
   *
   * Read through `useSyncExternalStore` rather than state set from an effect:
   * both answers are facts about this browser's storage, which does not exist
   * on the server, so the server snapshot has to be a fixed "no" or hydration
   * fails. The same shape the unlock token uses, and for the same reason.
   */
  const devicePinReady = React.useSyncExternalStore(
    subscribeToDeviceUnlock,
    () => hasDevicePin(userId),
    () => false
  );

  const biometricReady = React.useSyncExternalStore(
    subscribeToDeviceUnlock,
    () => hasBiometric(userId),
    () => false
  );

  /**
   * Whether this device has a fingerprint reader that can be used.
   *
   * The only question here that cannot be answered synchronously, so it is
   * asked once on mount and remembered. A device that has no reader — a
   * desktop, a cheap tablet — simply never shows the button.
   */
  const [biometricUsable, setBiometricUsable] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const usable = await isFingerprintUsable();
      if (!cancelled) setBiometricUsable(usable);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Ask for the fingerprint as soon as the screen appears.
   *
   * The prompt is the platform's own, and the user has seen it a hundred times
   * on this phone — making them tap a button first is a step, not a
   * convenience. A refusal is not an error: the keypad is right there.
   */
  const triedFingerprint = React.useRef(false);
  React.useEffect(() => {
    if (!biometricReady || !biometricUsable) return;
    if (triedFingerprint.current) return;
    triedFingerprint.current = true;
    void runFingerprint();
  });

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

  async function runFingerprint() {
    if (fingerprinting) return;
    setFingerprinting(true);
    setError(null);

    const ok = await verifyBiometric(userId);
    setFingerprinting(false);

    if (ok) {
      onUnlocked();
      return;
    }

    // A refused or failed fingerprint is not an error message: the user may
    // have cancelled it, or the sensor may have read a different finger. The
    // keypad is the way forward and it is already on screen.
    setError("That did not match. Use your MPIN, or try the fingerprint again.");
  }

  async function submit() {
    if (!pin || checking || locked) return;
    setChecking(true);
    setError(null);

    const outcome =
      mode === "device"
        ? await attemptDeviceUnlock(userId, pin)
        : await attemptUnlock(userId, pin);
    setChecking(false);

    if (outcome.ok) {
      // No "Unlocked" toast. Opening an app is not an event worth announcing —
      // it means the lock did its job, and the app appearing *is* the
      // confirmation. The toast also landed directly on top of the dashboard
      // the user was trying to reach.
      onUnlocked();
      return;
    }

    setError(outcome.error);
    setLockedUntil(outcome.lockedUntil ?? null);
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
          {mode === "device"
            ? "Enter this device's PIN to continue."
            : "Enter your MPIN to continue."}
        </p>
      </div>

      {/* The fingerprint. Big, because on a phone it is the fastest way in and
          the whole reason the device unlock exists. */}
      {biometricReady && biometricUsable ? (
        <button
          type="button"
          onClick={() => void runFingerprint()}
          disabled={fingerprinting || locked}
          aria-label="Unlock with fingerprint"
          className={cn(
            "flex size-20 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10 text-primary",
            "transition-all duration-150 hover:border-primary/60 hover:bg-primary/15 active:scale-95",
            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            "disabled:pointer-events-none disabled:opacity-40"
          )}
        >
          {fingerprinting ? (
            <Loader2 className="size-8 animate-spin" />
          ) : (
            <Fingerprint className="size-8" />
          )}
        </button>
      ) : null}

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
        aria-label={mode === "device" ? "Device PIN" : "MPIN"}
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

          {/* The bottom-left cell is where the fingerprint button used to sit. It
              is a spacer now: the keypad stays a 3x4 grid so the numbers never
              move, which matters more on a lock screen than on any other
              screen — and the fingerprint has a home above the dots, where a
              thumb expects it. */}
          <span aria-hidden="true" />

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

      {/* The other ways in. Only shown when they exist — a link to a device PIN
          that was never set up is a dead end. */}
      {!locked && (devicePinReady || mode === "device") ? (
        <button
          type="button"
          onClick={() => {
            setMode(mode === "device" ? "mpin" : "device");
            setPin("");
            setError(null);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4",
            "transition-colors hover:text-foreground hover:underline"
          )}
        >
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          {mode === "device" ? "Use my MPIN instead" : "Use this device's PIN instead"}
        </button>
      ) : null}

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

export type UnlockAttempt =
  | { ok: true }
  | { ok: false; error: string; lockedUntil?: number | null };

/**
 * One MPIN check, whichever device can answer it.
 *
 * Three outcomes, not two, and the middle one is the reason this is a function
 * rather than three lines inline:
 *
 * 1. **This device holds the hash** → verify locally. Correct PIN: the app
 *    opens with no network at all, and the server is told afterwards so its
 *    lockout counter and `last_unlocked_at` stay honest. Wrong PIN: fall
 *    through to the server anyway, so a device that has been locked out still
 *    gets locked out.
 * 2. **This device does not** → the server decides. New phone, cleared storage,
 *    private browsing. The typed PIN is then copied to this device, so the
 *    *next* unlock is a local one and the device stops needing a connection.
 * 3. **The server is unreachable and there is no local copy** → say so plainly.
 *    Reporting a wrong MPIN for a network failure locks a user out of their own
 *    workspace over a dead connection.
 */
export async function attemptUnlock(userId: string, pin: string): Promise<UnlockAttempt> {
  const local = await verifyLocalMpin(userId, pin).catch(() => false as boolean | null);

  if (local === true) {
    // Fire and forget. The app is already unlocked; a failure here only costs
    // an accurate `last_unlocked_at`, and surfacing it would be noise.
    void recordLocalUnlockAction().catch(() => {});
    return { ok: true };
  }

  let result: SecurityState;
  try {
    result = (await unlockWithMpinAction(pin)) as SecurityState;
  } catch {
    return {
      ok: false,
      error:
        local === null
          ? "Cannot reach the server, and no MPIN is stored on this device yet. Connect once while online to set it up."
          : "Cannot reach the server. Check your connection and try again.",
    };
  }

  if (result.success) {
    // Best-effort: this is what makes the next unlock work offline, and it is
    // not worth failing an unlock that already succeeded.
    void saveLocalMpin(userId, pin).catch(() => false);
    return { ok: true };
  }

  return {
    ok: false,
    error: result.error ?? "That MPIN is not right.",
    lockedUntil: result.lockedUntil ?? null,
  };
}

/**
 * One device-PIN check.
 *
 * Entirely local: the device PIN never leaves this machine, so there is no
 * server to ask and nothing to record. A wrong PIN is simply wrong.
 */
export async function attemptDeviceUnlock(
  userId: string,
  pin: string
): Promise<UnlockAttempt> {
  const result = await verifyDevicePin(userId, pin).catch(() => false as boolean | null);

  if (result === true) return { ok: true };
  if (result === null) {
    return { ok: false, error: "This device has no PIN set up." };
  }

  return { ok: false, error: "That is not this device's PIN." };
}

/**
 * Whether this device can do a fingerprint right now.
 *
 * Both the browser's support and the device's hardware have to say yes, and
 * the second one can only be asked asynchronously.
 */
async function isFingerprintUsable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext) return false;
  if (!("PublicKeyCredential" in window)) return false;

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
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
