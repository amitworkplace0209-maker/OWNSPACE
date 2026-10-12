"use client";

import * as React from "react";
import { Bell, BellOff, Clock, Layers, Moon, ShieldCheck, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRIORITIES } from "@/types";
import type { Priority } from "@/types";
import { cn } from "cn";
import {
  DEFAULT_NOTIFY_SETTINGS,
  type NotifySettings,
} from "@/lib/reminder-notify";
import {
  nextAlertHint,
  readNotifySettings,
  requestBrowserPermission,
  syncBrowserPermission,
  writeNotifySettings,
} from "@/components/reminders/reminder-notifier";

/**
 * Per-device notification settings.
 *
 * Everything here is stored in this browser's localStorage and is deliberately
 * **not** synced to the account. Quiet hours and permission are properties of
 * the device in front of you — a phone in a pocket at night and a desktop in
 * an office should not have to agree — and treating them as account data would
 * mean one device's settings silently muting another's alerts.
 *
 * The panel is a dialog rather than an inline block because it is a
 * configuration surface, not part of the list, and the reminders page is dense
 * enough without a permanent third control strip.
 */

const PRIORITY_LABEL: Record<Priority, string> = {
  none: "Everything",
  low: "Low and up",
  medium: "Medium and up",
  high: "High and up",
  urgent: "Critical only",
};

const DIGEST_WINDOWS: Array<{ label: string; minutes: number }> = [
  { label: "Instant", minutes: 0 },
  { label: "2 min", minutes: 2 },
  { label: "5 min", minutes: 5 },
  { label: "15 min", minutes: 15 },
];

export function NotificationSettingsButton({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  // Read after mount so the server render and the first client paint agree.
  const [settings, setSettings] = React.useState<NotifySettings>(DEFAULT_NOTIFY_SETTINGS);

  /**
   * Storage is read in the open handler rather than in an effect on `open`.
   *
   * The settings are only needed while the dialog is mounted, and syncing them
   * from an effect means a setState during the effect body — an extra render
   * pass on every open, and a panel that is one render stale on its first
   * frame. Reading at the point of intent gets it right the first time.
   */
  function handleOpenChange(next: boolean) {
    if (next) setSettings(syncBrowserPermission(readNotifySettings()));
    setOpen(next);
    onOpenChange?.(next);
  }

  function update(patch: Partial<NotifySettings>) {
    setSettings((current) => {
      const next = { ...current, ...patch };
      writeNotifySettings(next);
      return next;
    });
  }

  async function toggleBrowserChannel(next: boolean) {
    if (!next) {
      update({ channels: { ...settings.channels, browser: false } });
      return;
    }

    const permission = await requestBrowserPermission(settings);

    if (permission === "granted") {
      update({
        channels: { ...settings.channels, browser: true },
        browserPermission: "granted",
      });
      return;
    }

    if (permission === "unsupported") {
      update({ browserPermission: "unsupported" });
      toast.error("This browser cannot show system notifications.");
      return;
    }

    if (permission === "denied") {
      update({ browserPermission: "denied" });
      toast.error("Notifications are blocked in your browser settings.");
      return;
    }

    // "default" means dismissed — usually a close click. Say so rather than
    // leaving a toggle that appears to work but never fires.
    update({ browserPermission: "default" });
    toast("Permission was dismissed", {
      description: "Enable browser notifications to get alerts outside this tab.",
    });
  }

  const hint = nextAlertHint(settings);
  const anyChannel = settings.channels.in_app || settings.channels.browser;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleOpenChange(true)}
        aria-label="Notification settings"
      >
        {settings.enabled && anyChannel ? <Bell /> : <BellOff />}
        <span className="hidden sm:inline">Alerts</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Notification settings</DialogTitle>
            <DialogDescription>
              These apply to this device only and are never synced to your
              account, so a phone and a laptop can behave differently.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            {/* Master switch */}
            <Row
              icon={settings.enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              title="Alerts on this device"
              description={
                settings.enabled
                  ? "Due reminders can interrupt you."
                  : "Nothing is raised on this device. Reminders still list and still fire into the in-app feed."
              }
            >
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => update({ enabled: checked })}
                aria-label="Alerts on this device"
              />
            </Row>

            {settings.enabled ? (
              <>
                {/* Channels */}
                <Section label="Channels" icon={<Volume2 className="size-3.5" />}>
                  <Row
                    title="In-app"
                    description="A toast while Ownspece is open."
                    inset
                  >
                    <Switch
                      checked={settings.channels.in_app}
                      onCheckedChange={(checked) =>
                        update({ channels: { ...settings.channels, in_app: checked } })
                      }
                      aria-label="In-app notifications"
                    />
                  </Row>

                  <Row
                    title="Browser"
                    description={
                      settings.browserPermission === "unsupported"
                        ? "This browser does not support system notifications."
                        : settings.browserPermission === "denied"
                          ? "Blocked in your browser settings. Re-enable it there to use this."
                          : "A system notification, which shows even when this tab is in the background."
                    }
                    inset
                    disabled={settings.browserPermission === "unsupported"}
                  >
                    <Switch
                      checked={settings.channels.browser}
                      onCheckedChange={(checked) => void toggleBrowserChannel(checked)}
                      disabled={settings.browserPermission === "unsupported"}
                      aria-label="Browser notifications"
                    />
                  </Row>
                </Section>

                {/* Priority floor */}
                <Section label="Only alert me for" icon={<ShieldCheck className="size-3.5" />}>
                  <div className="flex flex-wrap gap-1">
                    {PRIORITIES.map((priority) => {
                      const active = settings.minPriority === priority;
                      return (
                        <button
                          key={priority}
                          type="button"
                          onClick={() => update({ minPriority: priority })}
                          aria-pressed={active}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs transition",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                          )}
                        >
                          {PRIORITY_LABEL[priority]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {settings.minPriority === "none"
                      ? "Every reminder can alert you."
                      : `Reminders below ${PRIORITY_LABEL[settings.minPriority].replace(" and up", "")} stay silent.`}
                  </p>
                </Section>

                {/* Digest */}
                <Section label="Batching" icon={<Layers className="size-3.5" />}>
                  <Row
                    title="Group reminders"
                    description="Several reminders coming due at once become one alert instead of several."
                    inset
                  >
                    <Switch
                      checked={settings.digest.enabled}
                      onCheckedChange={(checked) =>
                        update({ digest: { ...settings.digest, enabled: checked } })
                      }
                      aria-label="Group reminders"
                    />
                  </Row>

                  {settings.digest.enabled ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {DIGEST_WINDOWS.map((option) => {
                        const active = settings.digest.windowMinutes === option.minutes;
                        return (
                          <button
                            key={option.minutes}
                            type="button"
                            onClick={() =>
                              update({ digest: { ...settings.digest, windowMinutes: option.minutes } })
                            }
                            aria-pressed={active}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs transition",
                              active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </Section>

                {/* Quiet hours */}
                <Section label="Quiet hours" icon={<Moon className="size-3.5" />}>
                  <Row
                    title="Stay quiet overnight"
                    description={
                      hint
                        ? `${hint}. Due reminders still appear in the list and the in-app feed.`
                        : "Reminders that come due in this window are listed but do not alert."
                    }
                    inset
                  >
                    <Switch
                      checked={settings.quietHours.enabled}
                      onCheckedChange={(checked) =>
                        update({ quietHours: { ...settings.quietHours, enabled: checked } })
                      }
                      aria-label="Quiet hours"
                    />
                  </Row>

                  {settings.quietHours.enabled ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Clock aria-hidden="true" className="size-3.5 text-muted-foreground" />
                      <TimeInput
                        value={settings.quietHours.start}
                        onChange={(start) =>
                          update({ quietHours: { ...settings.quietHours, start } })
                        }
                        label="Quiet hours start"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <TimeInput
                        value={settings.quietHours.end}
                        onChange={(end) => update({ quietHours: { ...settings.quietHours, end } })}
                        label="Quiet hours end"
                      />
                    </div>
                  ) : null}

                  {settings.quietHours.start === settings.quietHours.end ? (
                    <p className="text-xs text-warning">
                      Start and end match, so the window is treated as switched off.
                    </p>
                  ) : null}
                </Section>
              </>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Muted reminders never alert regardless of these settings — that is
              set per reminder.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {icon}
        {label}
      </p>
      <div className="flex flex-col gap-2 rounded-lg border p-2">{children}</div>
    </div>
  );
}

function Row({
  icon,
  title,
  description,
  children,
  inset = false,
  disabled = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
  inset?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg px-2 py-1.5",
        inset && "bg-muted/30",
        disabled && "opacity-60"
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </p>
        <p className="text-xs text-pretty text-muted-foreground">{description}</p>
      </div>
      {children ? <div className="shrink-0 pt-0.5">{children}</div> : null}
    </div>
  );
}

/** A plain time input, but only ever yielding a value the parser accepts. */
function TimeInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <input
      type="time"
      value={value}
      aria-label={label}
      onChange={(event) => {
        const next = event.target.value;
        if (next) onChange(next);
      }}
      className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
    />
  );
}