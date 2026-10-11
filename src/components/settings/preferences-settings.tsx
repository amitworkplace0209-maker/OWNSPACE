"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/form-field";
import { updatePreferencesAction } from "@/lib/actions/profile";

type PrefsState = { error?: string; data?: { id: string } };

const views = [
  { value: "dashboard", label: "Dashboard" },
  { value: "projects", label: "Projects" },
  { value: "tasks", label: "Tasks" },
  { value: "calendar", label: "Calendar" },
  { value: "wiki", label: "Wiki" },
];

export function PreferencesSettings({
  defaultView,
  dailyNoteTime,
}: {
  defaultView: string;
  dailyNoteTime: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<PrefsState, FormData>(updatePreferencesAction, {});
  const [dirty, setDirty] = useState(false);
  const [daily, setDaily] = useState(dailyNoteTime?.slice(0, 5) ?? "");

  useEffect(() => {
    if (state.data) {
      toast.success("Preferences saved.");
    }
  }, [state.data]);

  // Only the fields this form owns are sent. Re-posting `theme` here used to
  // overwrite a theme the user had just changed elsewhere on the page.
  function handleSubmit(formData: FormData) {
    const fd = new FormData();
    fd.set("default_view", String(formData.get("default_view") ?? defaultView));
    fd.set("daily_note_time", daily.trim());
    formAction(fd);
    setDirty(false);
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <FormField label="Default landing view" hint="Where Ownspece should take you after sign-in.">
        <select
          name="default_view"
          defaultValue={defaultView}
          onChange={() => setDirty(true)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
        >
          {views.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Daily note time" hint="Optional; used for daily check-in planning.">
        <Input
          type="time"
          value={daily}
          onChange={(e) => {
            setDaily(e.target.value);
            setDirty(true);
          }}
        />
      </FormField>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}