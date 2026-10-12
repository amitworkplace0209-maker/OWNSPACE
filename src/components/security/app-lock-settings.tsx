"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import {
  setLockEnabledAction,
  setLockDurationAction,
  setMpinAction,
  type SecurityState,
} from "@/lib/actions/security";
import { deleteWebauthnCredentialAction } from "@/lib/actions/security-webauthn";
import { LOCK_DURATIONS, MPIN_MAX, MPIN_MIN } from "@/lib/security/mpin";
import { cn } from "cn";

export type LockSettings = {
  lockEnabled: boolean;
  hasMpin: boolean;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  credentials: Array<{ id: string; label: string | null; createdAt: string }>;
  durationId: string;
};

/**
 * The app-lock panel.
 *
 * Writes the MPIN and turns the lock on separately on purpose: someone may want
 * a PIN stored for later without wanting to be locked out of their own app the
 * moment they close this dialog, and a single "save" that did both would make
 * that impossible to express.
 */
export function AppLockSettings({ settings }: { settings: LockSettings }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SecurityState, FormData>(
    setMpinAction,
    { error: undefined }
  );
  const [toggling, startToggle] = useTransition();
  const [confirmOff, setConfirmOff] = React.useState(false);
  const [removing, setRemoving] = React.useState<{ id: string; label: string } | null>(null);
  const [mpin, setMpin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [current, setCurrent] = React.useState("");

  const [enrolling, setEnrolling] = React.useState(false);

  // The success message is the signal that the form is finished with, so it is
  // tracked by value: `useActionState` hands back the *same* object on unrelated
  // re-renders, and an effect keyed on the object identity would fire the toast
  // again every time the panel re-rendered.
  const [handledSuccess, setHandledSuccess] = React.useState<string | null>(null);

  // Clearing the boxes during render rather than in an effect. This is React's
  // "adjust state when a prop changes" pattern: comparing against the previously
  // handled value makes it happen exactly once per success, in the same pass
  // that noticed it, with no second render and no risk of the user typing into a
  // field that is about to be emptied underneath them.
  if (state?.success && state.success !== handledSuccess) {
    setHandledSuccess(state.success);
    setMpin("");
    setConfirm("");
    setCurrent("");
  }

  React.useEffect(() => {
    if (!state?.success || state.success === handledSuccess) return;
    toast.success(state.success);
    router.refresh();
  }, [state, handledSuccess, router]);

  // Mirrors the live strength into a hint rather than a rule: the digit count is
  // known from the box, and scrypt is doing the actual work.
  const strength = mpin.length >= 6 ? "strong" : mpin.length >= 4 ? "weak" : "none";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lock className="size-4 text-muted-foreground" />
            App lock
          </CardTitle>
          <CardDescription>
            Ask for your MPIN when Ownspece opens, so someone with your phone cannot read it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {settings.lockEnabled ? "Lock is on" : "Lock is off"}
              </p>
              <p className="text-xs text-muted-foreground">
                {settings.lockEnabled
                  ? "You will be asked for your MPIN each time the app opens."
                  : "Anyone who opens Ownspece on this device can read everything."}
              </p>
            </div>
            <Button
              variant={settings.lockEnabled ? "outline" : "default"}
              size="sm"
              disabled={toggling || (!settings.hasMpin && !settings.lockEnabled)}
              title={
                !settings.hasMpin && !settings.lockEnabled
                  ? "Set an MPIN below first"
                  : undefined
              }
              onClick={() => {
                if (settings.lockEnabled) {
                  setConfirmOff(true);
                  return;
                }
                startToggle(async () => {
                  const result = await setLockEnabledAction(true);
                  if (result.error) toast.error(result.error);
                  else {
                    toast.success("App lock is on.");
                    router.refresh();
                  }
                });
              }}
            >
              {toggling ? "Working…" : settings.lockEnabled ? "Turn off" : "Turn on"}
            </Button>
          </div>

          {settings.lockEnabled ? (
            <FormField label="Re-lock after">
              <div className="grid gap-2 sm:grid-cols-2">
                {LOCK_DURATIONS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() =>
                      startToggle(async () => {
                        const result = await setLockDurationAction(entry.id);
                        if (result.error) toast.error(result.error);
                        else {
                          toast.success("Saved.");
                          router.refresh();
                        }
                      })
                    }
                    aria-pressed={settings.durationId === entry.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all duration-200",
                      "hover:border-primary/40 hover:bg-accent active:scale-[0.98]",
                      settings.durationId === entry.id
                        ? "border-primary bg-primary/10 font-medium"
                        : ""
                    )}
                  >
                    <span
                      className={cn(
                        "size-3.5 rounded-full border-2 transition-colors",
                        settings.durationId === entry.id
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/30"
                      )}
                    />
                    {entry.label}
                  </button>
                ))}
              </div>
            </FormField>
          ) : null}
        </CardContent>
      </Card>

      {/* --- MPIN ---------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="size-4 text-muted-foreground" />
            {settings.hasMpin ? "Change your MPIN" : "Set your MPIN"}
          </CardTitle>
          <CardDescription>
            {MPIN_MIN}–{MPIN_MAX} digits. Stored as a salted scrypt hash — the number itself is never
            written anywhere.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            {settings.hasMpin ? (
              <FormField label="Current MPIN" hint="Needed to change it">
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  name="current_mpin"
                  value={current}
                  onChange={(event) =>
                    setCurrent(event.target.value.replace(/\D/g, "").slice(0, MPIN_MAX))
                  }
                  className="max-w-[12rem]"
                />
              </FormField>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="New MPIN"
                error={state?.error}
                hint={`${mpin.length}/${MPIN_MAX} digits`}
              >
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  name="mpin"
                  value={mpin}
                  onChange={(event) =>
                    setMpin(event.target.value.replace(/\D/g, "").slice(0, MPIN_MAX))
                  }
                  className="max-w-[12rem]"
                  required
                />
                <StrengthMeter strength={strength} />
              </FormField>

              <FormField label="Confirm MPIN">
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  name="confirm_mpin"
                  value={confirm}
                  onChange={(event) =>
                    setConfirm(event.target.value.replace(/\D/g, "").slice(0, MPIN_MAX))
                  }
                  className="max-w-[12rem]"
                  required
                />
              </FormField>
            </div>

            <input type="hidden" name="lock_duration" value={settings.durationId} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="enable_lock"
                defaultChecked={settings.lockEnabled}
                className="size-4 accent-primary"
              />
              Turn the app lock on now
            </label>

            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : settings.hasMpin ? "Change MPIN" : "Save MPIN"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* --- Biometric ------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Fingerprint className="size-4 text-muted-foreground" />
            Biometric unlock
          </CardTitle>
          <CardDescription>
            Use your fingerprint or face instead of typing. The private key never leaves this device —
            only a public key is stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!settings.biometricAvailable ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              This browser has no fingerprint or face unlock available. It needs HTTPS, and on desktop
              it usually means Windows Hello or a Mac with Touch ID.
            </p>
          ) : null}

          {settings.credentials.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {settings.credentials.map((credential) => (
                <li
                  key={credential.id}
                  className="flex items-center gap-3 rounded-lg border p-3 transition hover:border-destructive/40"
                >
                  <ShieldCheck className="size-4 shrink-0 text-success" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {credential.label ?? "This device"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Enrolled {new Date(credential.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${credential.label ?? "this device"}`}
                    onClick={() =>
                      setRemoving({ id: credential.id, label: credential.label ?? "this device" })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex justify-end">
            <Button
              variant="outline"
              disabled={!settings.biometricAvailable || enrolling}
              onClick={() => setEnrolling(true)}
            >
              {enrolling ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
              {settings.credentials.length > 0 ? "Enrol another device" : "Turn on biometric unlock"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="Turn the app lock off?"
        description="Anyone who opens Ownspece on this device will be able to read everything until you turn it back on. Your MPIN is kept."
        confirmLabel="Turn off"
        onConfirm={async () => {
          setConfirmOff(false);
          const result = await setLockEnabledAction(false);
          if (result.error) toast.error(result.error);
          else {
            toast.success("App lock is off.");
            router.refresh();
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.label ?? "this device"}?`}
        description="That device will have to type your MPIN instead. Other devices keep their own."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          const target = removing;
          setRemoving(null);
          const result = await deleteWebauthnCredentialAction(target.id);
          if (result.error) toast.error(result.error);
          else {
            toast.success("Device removed.");
            router.refresh();
          }
        }}
      />

      {/* Declared so the enrolment intent survives the browser's own prompt,
          which navigates nothing but does tear down client state on some
          browsers. */}
      {enrolling ? (
        <WebAuthnEnroller
          onDone={() => {
            setEnrolling(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function StrengthMeter({ strength }: { strength: "none" | "weak" | "strong" }) {
  const filled = strength === "strong" ? 3 : strength === "weak" ? 2 : 0;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex gap-1">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={cn(
              "h-1 w-6 rounded-full transition-colors duration-200",
              step <= filled
                ? filled === 3
                  ? "bg-success"
                  : "bg-warning"
                : "bg-muted"
            )}
          />
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground">
        {strength === "strong" ? "Good length" : strength === "weak" ? "Six digits or more is better" : ""}
      </span>
    </div>
  );
}

/** Enrols this browser's authenticator. Split out so the panel above stays readable. */
function WebAuthnEnroller({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const { beginWebauthnEnrolment } = await import("@/lib/security/webauthn.client");
      const result = await beginWebauthnEnrolment();
      if (cancelled) return;

      if (result.ok) {
        toast.success("Biometric unlock is on for this device.");
      } else if (result.error === "cancelled") {
        // Pressing Cancel is not a failure and should not look like one.
        toast.info("Enrolment cancelled.");
      } else {
        toast.error(result.error);
      }

      onDone();
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [onDone, router]);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 text-center">
        <Fingerprint className="size-8 animate-pulse text-primary" />
        <p className="text-sm text-muted-foreground">
          Follow your device&apos;s prompt to enrol…
        </p>
      </div>
    </div>
  );
}
