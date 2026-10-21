"use client";

import * as React from "react";
import { toast } from "sonner";
import { Fingerprint, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
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
  clearBiometric,
  clearDevicePin,
  enrolBiometric,
  hasBiometric,
  hasDevicePin,
  isBiometricSupported,
  saveDevicePin,
  subscribeToDeviceUnlock,
} from "@/lib/security/device-unlock.client";
import { MPIN_MAX, MPIN_MIN } from "@/lib/security/mpin";
import { cn } from "cn";

/**
 * The device's own unlock.
 *
 * Two settings, and both of them are about *this machine* rather than the
 * account:
 *
 *  - **A device PIN.** A number set here, kept here, and gone the moment the
 *    account signs out. It unlocks the app on this device and nowhere else.
 *  - **A fingerprint.** The device's own secure hardware. The private key never
 *    leaves the device and the server is not involved at any point, so there
 *    is nothing here that could be stolen from a database.
 *
 * Both sit *in front of* the account MPIN rather than replacing it: the MPIN
 * is what signs in and what the lock falls back to, and these two are the fast
 * way back in on the machine you are already holding.
 */
export function DeviceUnlockSettings({ userId }: { userId: string }) {
  const [pin, setPin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmRemovePin, setConfirmRemovePin] = React.useState(false);
  const [biometricBusy, setBiometricBusy] = React.useState(false);
  const [supported, setSupported] = React.useState<boolean | null>(null);

  /**
   * What this device already has.
   *
   * Read through `useSyncExternalStore`, because both answers are facts about
   * this browser's storage and the server has neither. The server snapshot is
   * a fixed "no", so the first paint agrees with the server's.
   */
  const pinReady = React.useSyncExternalStore(
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
   * The one question here that cannot be answered synchronously, so it is
   * asked once and remembered. Until the answer arrives the row says
   * "checking" rather than pretending the device has no reader.
   */
  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const usable = await isBiometricSupported();
      if (!cancelled) setSupported(usable);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function savePin(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (pin !== confirm) {
      toast.error("The two PINs do not match.");
      return;
    }

    if (pin.length < MPIN_MIN || pin.length > MPIN_MAX) {
      toast.error(`Use between ${MPIN_MIN} and ${MPIN_MAX} digits.`);
      return;
    }

    setBusy(true);
    const stored = await saveDevicePin(userId, pin);
    setBusy(false);

    if (!stored) {
      toast.error("This device would not keep the PIN.");
      return;
    }

    setPin("");
    setConfirm("");
    toast.success("Device PIN saved on this device.");
  }

  async function toggleBiometric() {
    if (biometricBusy) return;
    setBiometricBusy(true);

    if (biometricReady) {
      clearBiometric(userId);
      setBiometricBusy(false);
      toast.success("Fingerprint unlock turned off on this device.");
      return;
    }

    const result = await enrolBiometric(userId);
    setBiometricBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("Fingerprint unlock is on for this device.");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Fingerprint className="size-4 text-muted-foreground" />
            Fingerprint
          </CardTitle>
          <CardDescription>
            Unlock Ownspece with this device&apos;s fingerprint or face. The key
            stays in the device&apos;s secure hardware — Ownspece never sees it
            and the server is not involved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <ShieldCheck
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                biometricReady ? "text-success" : "text-muted-foreground"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {biometricReady
                  ? "Fingerprint unlock is on"
                  : supported === false
                    ? "This device has no usable reader"
                    : supported === null
                      ? "Checking this device…"
                      : "Fingerprint unlock is off"}
              </p>
              <p className="text-xs text-muted-foreground">
                {biometricReady
                  ? "The lock screen will offer your fingerprint first."
                  : supported === false
                    ? "A desktop without a reader, or a browser that does not allow it, cannot use this."
                    : "Turn it on and the lock screen will ask your device the moment it opens."}
              </p>
            </div>
            <Button
              variant={biometricReady ? "outline" : "default"}
              size="sm"
              disabled={biometricBusy || supported === false}
              onClick={() => void toggleBiometric()}
            >
              {biometricBusy ? "Working…" : biometricReady ? "Turn off" : "Turn on"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="size-4 text-muted-foreground" />
            Device PIN
          </CardTitle>
          <CardDescription>
            A second number for this device only. It unlocks Ownspece here
            without a network, and it is deleted when you sign out.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {pinReady ? (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">A device PIN is set</p>
                <p className="text-xs text-muted-foreground">
                  The lock screen will offer it instead of your account MPIN.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmRemovePin(true)}
              >
                <Trash2 /> Remove
              </Button>
            </div>
          ) : null}

          <form onSubmit={savePin} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={pinReady ? "New device PIN" : "Device PIN"}
                hint={`${pin.length}/${MPIN_MAX} digits`}
              >
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  maxLength={MPIN_MAX}
                  onChange={(event) =>
                    setPin(event.target.value.replace(/\D/g, "").slice(0, MPIN_MAX))
                  }
                  className="max-w-[12rem]"
                  required
                />
              </FormField>

              <FormField label="Confirm device PIN">
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={confirm}
                  maxLength={MPIN_MAX}
                  onChange={(event) =>
                    setConfirm(event.target.value.replace(/\D/g, "").slice(0, MPIN_MAX))
                  }
                  className="max-w-[12rem]"
                  required
                />
              </FormField>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={busy || !pin}>
                {busy ? "Saving…" : pinReady ? "Change device PIN" : "Save device PIN"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmRemovePin}
        onOpenChange={setConfirmRemovePin}
        title="Remove the device PIN?"
        description="This device will go back to asking for your account MPIN. Your account is not affected."
        confirmLabel="Remove"
        onConfirm={() => {
          setConfirmRemovePin(false);
          clearDevicePin(userId);
          toast.success("Device PIN removed.");
        }}
      />
    </div>
  );
}
