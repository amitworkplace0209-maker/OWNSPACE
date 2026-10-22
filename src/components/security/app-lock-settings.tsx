"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
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
import {
  hasLocalMpin,
  saveLocalMpin,
  subscribeToLocalMpin,
} from "@/lib/security/local-mpin.client";
import { LOCK_DURATIONS, MPIN_MAX, MPIN_MIN } from "@/lib/security/mpin";
import { cn } from "cn";

export type LockSettings = {
  lockEnabled: boolean;
  hasMpin: boolean;
  durationId: string;
};

/**
 * The app-lock panel.
 *
 * One MPIN, one place. There is no biometric switch and no second "app PIN"
 * here — the account's MPIN *is* the lock, and this panel is the only place it
 * is ever changed. What this device additionally keeps is a copy for offline
 * unlocks, and that copy is listed here as a fact about this machine rather
 * than as a setting, because it follows the MPIN automatically.
 */
export function AppLockSettings({
  settings,
  userId,
}: {
  settings: LockSettings;
  /** Scopes the device-local MPIN copy to this account. */
  userId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SecurityState, FormData>(
    setMpinAction,
    { error: undefined }
  );
  const [toggling, startToggle] = useTransition();
  const [confirmOff, setConfirmOff] = React.useState(false);
  const [mpin, setMpin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [current, setCurrent] = React.useState("");

  /**
   * Whether this device already holds a usable copy of the account's MPIN.
   *
   * An external store rather than `useState` set from an effect: the answer is
   * a fact about `localStorage`, which does not exist on the server, so the
   * server snapshot has to be a fixed `false` or hydration fails. That is the
   * same shape the unlock token uses, and for the same reason.
   */
  const storedHere = React.useSyncExternalStore(
    subscribeToLocalMpin,
    () => hasLocalMpin(userId),
    () => false
  );

  // The success message is the signal that the form is finished with, so it is
  // tracked by value: `useActionState` hands back the *same* object on unrelated
  // re-renders, and an effect keyed on the object identity would fire the toast
  // again every time the panel re-rendered.
  const [handledSuccess, setHandledSuccess] = React.useState<string | null>(null);

  // The MPIN that produced the success, kept because the boxes below are
  // cleared in the same pass that notices it. Without this the device-local copy
  // would be re-derived from an empty string.
  const [savedMpin, setSavedMpin] = React.useState("");

  // Clearing the boxes during render rather than in an effect. This is React's
  // "adjust state when a prop changes" pattern: comparing against the previously
  // handled value makes it happen exactly once per success, in the same pass
  // that noticed it, with no second render and no risk of the user typing into a
  // field that is about to be emptied underneath them.
  if (state?.success && state.success !== handledSuccess) {
    setHandledSuccess(state.success);
    setSavedMpin(mpin);
    setMpin("");
    setConfirm("");
    setCurrent("");
  }

  React.useEffect(() => {
    if (!state?.success || state.success === handledSuccess) return;
    toast.success(state.success);

    // Keep this device's copy in step with the account. The same number, the
    // same place, written whenever it changes — which is what makes the MPIN
    // genuinely identical everywhere instead of "the account's MPIN, plus
    // whatever this phone happens to think it is".
    if (savedMpin) {
      void saveLocalMpin(userId, savedMpin);
    }

    router.refresh();
  }, [state, handledSuccess, savedMpin, userId, router]);

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
              <p className="text-xs text-muted-foreground">
                The app always locks when it is closed or sent to the background,
                whatever this is set to. This only says how long it stays open
                while you are using it.
              </p>
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

      {/* --- This device ------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Smartphone className="size-4 text-muted-foreground" />
            Offline unlock on this device
          </CardTitle>
          <CardDescription>
            Ownspece keeps a derived copy of the same MPIN on this device, so the
            lock screen opens without a connection. It is written whenever the MPIN
            changes, and removed when you sign out. A fingerprint or a device
            PIN — both set under <span className="font-medium text-foreground">This device</span> —
            is faster still.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <ShieldCheck
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                storedHere ? "text-success" : "text-muted-foreground"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {storedHere ? "Ready to unlock offline" : "Not stored on this device"}
              </p>
              <p className="text-xs text-muted-foreground">
                {storedHere
                  ? "Typing your MPIN opens the app with no network at all."
                  : "Sign in once while online and enter your MPIN here, and it will be kept here."}
              </p>
            </div>
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
