"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/form-field";
import { updatePomodoroSettingsAction } from "@/lib/actions/time";

type State = { error?: string; data?: { id: string } };

export function PomodoroSettings({
  focusMinutes,
  breakMinutes,
}: {
  focusMinutes: number;
  breakMinutes: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<State, FormData>(updatePomodoroSettingsAction, {});
  const [focus, setFocus] = useState(String(focusMinutes));
  const [brk, setBrk] = useState(String(breakMinutes));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.data) {
      toast.success("Pomodoro settings saved.");
    }
  }, [state.data]);

  function handleSubmit() {
    const fd = new FormData();
    fd.set("focus_duration_minutes", focus.trim());
    fd.set("break_duration_minutes", brk.trim());
    formAction(fd);
    setDirty(false);
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Focus length (minutes)" hint="Default length of a work session.">
          <Input
            type="number"
            min={1}
            max={180}
            value={focus}
            onChange={(e) => {
              setFocus(e.target.value);
              setDirty(true);
            }}
          />
        </FormField>
        <FormField label="Break length (minutes)" hint="Default short-break length.">
          <Input
            type="number"
            min={0}
            max={60}
            value={brk}
            onChange={(e) => {
              setBrk(e.target.value);
              setDirty(true);
            }}
          />
        </FormField>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save pomodoro settings"}
        </Button>
      </div>
    </form>
  );
}