"use client";

import { useActionState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { updatePreferencesAction } from "@/lib/actions/profile";
import { cn } from "cn";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

type PrefsState = { error?: string };

export function AppearanceSettings({
  currentTheme,
  defaultView,
  dailyNoteTime,
}: {
  currentTheme: string;
  defaultView: string;
  dailyNoteTime: string | null;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [state, applyAction] = useActionState<PrefsState, FormData>(updatePreferencesAction, {});

  function choose(theme: string) {
    setTheme(theme);
    const fd = new FormData();
    fd.set("theme", theme);
    fd.set("default_view", defaultView);
    fd.set("daily_note_time", dailyNoteTime ?? "");
    applyAction(fd);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          const active = currentTheme === opt.value;
          return (
            <button
              key={opt.value}
              role="radio"
              aria-checked={active}
              onClick={() => choose(opt.value)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <Icon className="size-4" />
              {opt.label}
            </button>
          );
        })}
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <p className="text-xs text-muted-foreground">Your theme choice is saved and synced across devices.</p>
    </div>
  );
}